import chunksData from '../data/chunks.json';
import { BM25 } from './bm25';
import { hydrateIcons } from './icons';
import { buildSystemPrompt, buildUserPrompt, judgeAnswer, streamAnswer, type StreamHandle } from './llm';
import { hybridRetrieve, loadEmbeddings } from './search';
import {
  badgeKindFor,
  CATEGORIES,
  CATEGORY_HINT,
  CATEGORY_LABEL,
  CATEGORY_SUGGESTIONS,
  CTA_LINKS,
  PRODUCTION_CONTACT,
  type Chunk,
  type JudgeResult,
  type RetrievedChunk,
} from './types';

const CHUNKS = chunksData as Chunk[];
const CHUNK_BY_ID = new Map(CHUNKS.map((c) => [c.id, c]));
const CATEGORY_ICON: Record<string, string> = {
  제작: 'clapper',
  기획: 'bulb',
  편집: 'scissors',
  후반문의: 'wrench',
  회사정보: 'info',
};

const bm25 = new BM25(CHUNKS.map((c) => ({ id: c.id, text: `${c.title} ${c.section} ${c.text}` })));

interface Message {
  role: 'user' | 'assistant';
  text: string;
  citations?: RetrievedChunk[];
  judge?: JudgeResult | null;
  judging?: boolean;
  feedback?: 'up' | 'down' | null;
  streaming?: boolean;
  isGreeting?: boolean;
  bubbleEl?: HTMLElement;
}

const threads = new Map<string, Message[]>(CATEGORIES.map((c) => [c, []]));

const KEY_STORAGE = 'hp_rag_api_key';
const WEIGHT_STORAGE = 'hp_rag_cosine_weight';
let apiKey = localStorage.getItem(KEY_STORAGE) || '';
let cosineWeight = parseFloat(localStorage.getItem(WEIGHT_STORAGE) || '0.5');
let activeTab: 'home' | 'chat' | 'settings' = 'home';
let activeCategory: string | null = null;
let currentStream: StreamHandle | null = null;

const $ = <T extends Element = Element>(sel: string) => document.querySelector(sel) as T;
const $$ = <T extends Element = Element>(sel: string) => Array.from(document.querySelectorAll(sel)) as T[];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------- tab switching ----------------
function switchTab(tab: 'home' | 'chat' | 'settings') {
  activeTab = tab;
  $$('.panel').forEach((p) => p.classList.toggle('is-active', p.getAttribute('data-panel') === tab));
  $$('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-tab') === tab));
  if (tab === 'settings') {
    ($('#api-key-input') as HTMLInputElement).value = apiKey;
    ($('#weight-slider') as HTMLInputElement).value = String(cosineWeight);
    updateWeightHelp();
  }
  if (tab === 'chat') {
    setTimeout(() => ($('#chat-input') as HTMLInputElement)?.focus(), 50);
  }
}

// ---------------- home: category list ----------------
function renderCatList() {
  const list = $('#cat-list');
  const catPills = CATEGORIES.map(
    (cat) => `
    <button class="pill" data-cat="${cat}" title="${CATEGORY_HINT[cat]}">
      <span class="pill-icon" data-icon="${CATEGORY_ICON[cat]}"></span>
      <span>${CATEGORY_LABEL[cat]}</span>
    </button>`
  ).join('');
  const altPill = `
    <a class="pill pill-alt" href="mailto:hooking.point@gmail.com">
      <span class="pill-icon" data-icon="mail"></span>
      <span>다른 방법으로 문의</span>
    </a>`;
  list.innerHTML = catPills + altPill;
  hydrateIcons(list);
  list.querySelectorAll<HTMLElement>('.pill[data-cat]').forEach((row) => {
    const cat = row.getAttribute('data-cat')!;
    row.addEventListener('click', () => (cat === '제작' ? openProductionSubmenu() : openCategory(cat)));
  });
}

// "제작" 카테고리는 채팅으로 바로 들어가지 않고, 라인업 문의(채팅) / 제작 협업문의(연락처)
// 두 갈래로 나뉘는 선택 모달을 먼저 보여준다.
function openProductionSubmenu() {
  $('#modal-badge').innerHTML = '';
  $('#modal-title').textContent = '제작';
  $('#modal-text').innerHTML = `
    <div class="contact-links">
      <button type="button" class="cta-btn block" id="submenu-lineup"><span data-icon="clapper"></span> 라인업 문의</button>
      <button type="button" class="cta-btn block" id="submenu-contact"><span data-icon="handshake"></span> 제작 협업문의</button>
    </div>`;
  $('#modal-url').textContent = '';
  hydrateIcons($('#modal-text'));
  $('#modal-backdrop').classList.add('is-open');
  $('#submenu-lineup').addEventListener('click', () => {
    closeModal();
    openCategory('제작');
    $('#chat-cat-label').textContent = '라인업 문의';
  });
  $('#submenu-contact').addEventListener('click', () => {
    openProductionContactModal();
  });
}

function openProductionContactModal() {
  $('#modal-badge').innerHTML = '';
  $('#modal-title').textContent = '제작 협업문의';
  const phoneRow = PRODUCTION_CONTACT.phone
    ? `<a class="cta-btn block" href="tel:${PRODUCTION_CONTACT.phone.replace(/[^0-9+]/g, '')}"><span data-icon="phone"></span> ${PRODUCTION_CONTACT.phone}</a>`
    : `<div class="cta-btn block muted"><span data-icon="phone"></span> 전화번호 확인 중 — 우선 이메일로 문의해주세요</div>`;
  $('#modal-text').innerHTML = `
    <div class="contact-links">
      ${phoneRow}
      <a class="cta-btn block" href="mailto:${PRODUCTION_CONTACT.email}"><span data-icon="mail"></span> ${PRODUCTION_CONTACT.email}</a>
    </div>`;
  $('#modal-url').textContent = '';
  hydrateIcons($('#modal-text'));
  $('#modal-backdrop').classList.add('is-open');
}

function closeModal() {
  $('#modal-backdrop').classList.remove('is-open');
}

function openCategory(cat: string) {
  activeCategory = cat;
  switchTab('chat');
  renderChatHeader();
  const thread = threads.get(cat)!;
  if (thread.length === 0) {
    thread.push({
      role: 'assistant',
      text: `${CATEGORY_LABEL[cat]} 관련해서 무엇이든 물어보세요.\n${CATEGORY_HINT[cat]}`,
      isGreeting: true,
    });
  }
  renderMessages();
}

function renderChatHeader() {
  if (!activeCategory) return;
  $('#chat-cat-label').textContent = CATEGORY_LABEL[activeCategory];
  $('#chat-cat-hint').textContent = CATEGORY_HINT[activeCategory];

  const suggestRow = $('#suggest-row');
  suggestRow.innerHTML = (CATEGORY_SUGGESTIONS[activeCategory] || [])
    .map((q) => `<button type="button" class="pill pill-sm" data-suggest="${escapeHtml(q)}">${q}</button>`)
    .join('');
  suggestRow.querySelectorAll<HTMLElement>('[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      (($('#chat-input') as HTMLInputElement).value = btn.getAttribute('data-suggest') || '');
      sendMessage();
    });
  });

  const ctaRow = $('#cta-row');
  ctaRow.innerHTML = (CTA_LINKS[activeCategory] || [])
    .map((c) => `<a class="cta-btn" href="${c.href}" target="_blank" rel="noopener">${c.label}</a>`)
    .join('');
  const warn = $('#key-warning') as HTMLElement;
  warn.style.display = apiKey ? 'none' : 'flex';
}

// ---------------- message rendering ----------------
function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

function renderMessages() {
  const scroll = $('#msg-scroll');
  const thread = activeCategory ? threads.get(activeCategory)! : [];
  scroll.innerHTML = '';
  if (thread.length === 0) {
    scroll.innerHTML = '<div class="empty-chat" id="empty-chat">궁금한 점을 입력해보세요.</div>';
    return;
  }
  thread.forEach((msg) => {
    const row = document.createElement('div');
    row.className = `msg-row ${msg.role}`;

    const col = document.createElement('div');
    col.className = 'msg-col';

    if (msg.role === 'assistant') {
      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar';
      avatar.innerHTML = '<img src="/favicon.png" alt="" />';
      row.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = escapeHtml(msg.text).replace(/\[(\d+)\]/g, '<span class="cite">[$1]</span>');
    msg.bubbleEl = bubble;
    col.appendChild(bubble);

    if (msg.role === 'assistant' && msg.citations && msg.citations.length > 0) {
      const chips = document.createElement('div');
      chips.className = 'source-chips';
      msg.citations.forEach((c) => {
        const kind = badgeKindFor(c.source);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `chip chip-${kind}`;
        chip.innerHTML = `<span class="chip-title">[${c.refIndex}] ${c.title}</span>`;
        chip.addEventListener('click', () => openSourceModal(c));
        chips.appendChild(chip);
      });
      col.appendChild(chips);
    }

    if (msg.role === 'assistant' && (msg.judge || msg.judging)) {
      const line = document.createElement('div');
      line.className = 'judge-line';
      if (msg.judging) {
        line.innerHTML = `<span class="judge-pill">자동판정 채점 중…</span>`;
      } else if (msg.judge) {
        const g = msg.judge.groundedness;
        const gClass = g >= 0.6 ? 'good' : 'bad';
        const refusalTxt =
          msg.judge.refusal_appropriate === null
            ? ''
            : `<span class="judge-pill ${msg.judge.refusal_appropriate ? 'good' : 'bad'}">거절 ${msg.judge.refusal_appropriate ? '적절' : '부적절'}</span>`;
        line.innerHTML = `<span class="judge-pill ${gClass}">근거성 ${g.toFixed(2)}</span>${refusalTxt}${msg.judge.unsupported_claims ? '<span class="judge-pill bad">미근거 진술 있음</span>' : ''}`;
      }
      col.appendChild(line);
    }

    if (msg.role === 'assistant' && !msg.streaming && msg.text && !msg.isGreeting) {
      const fb = document.createElement('div');
      fb.className = 'feedback-row';
      const up = document.createElement('button');
      up.className = `fb-btn ${msg.feedback === 'up' ? 'active-up' : ''}`;
      up.setAttribute('data-icon', 'thumbsUp');
      up.addEventListener('click', () => {
        msg.feedback = msg.feedback === 'up' ? null : 'up';
        renderMessages();
      });
      const down = document.createElement('button');
      down.className = `fb-btn ${msg.feedback === 'down' ? 'active-down' : ''}`;
      down.setAttribute('data-icon', 'thumbsDown');
      down.addEventListener('click', () => {
        msg.feedback = msg.feedback === 'down' ? null : 'down';
        renderMessages();
      });
      fb.appendChild(up);
      fb.appendChild(down);
      col.appendChild(fb);
    }

    row.appendChild(col);
    scroll.appendChild(row);
  });
  hydrateIcons(scroll);
  scroll.scrollTop = scroll.scrollHeight;
}

// ---------------- sending ----------------
async function sendMessage() {
  if (!activeCategory) return;
  const input = $('#chat-input') as HTMLInputElement;
  const question = input.value.trim();
  if (!question || currentStream) return;
  input.value = '';

  const thread = threads.get(activeCategory)!;
  thread.push({ role: 'user', text: question });
  renderMessages();

  if (!apiKey) {
    (['#key-warning'] as const).forEach((sel) => (($(sel) as HTMLElement).style.display = 'flex'));
    thread.push({
      role: 'assistant',
      text: '아직 API 키가 없어서 답변을 만들 수 없어요. 설정 탭에서 Gemini API 키를 먼저 입력해주세요.',
    });
    renderMessages();
    return;
  }

  const searchingMsg: Message = { role: 'assistant', text: '', streaming: true, isGreeting: true };
  thread.push(searchingMsg);
  renderMessages();
  if (searchingMsg.bubbleEl) searchingMsg.bubbleEl.textContent = '근거 검색 중…';

  const retrieved = await hybridRetrieve({
    bm25,
    chunkById: CHUNK_BY_ID,
    category: activeCategory,
    query: question,
    apiKey: apiKey || null,
    cosineWeight,
    topK: 5,
  });
  thread.splice(thread.indexOf(searchingMsg), 1);

  if (retrieved.length === 0) {
    thread.push({
      role: 'assistant',
      text: '제공된 자료에서는 확인되지 않았어요. 위의 문의 버튼으로 직접 연락해주시면 정확히 안내해드릴게요.',
      citations: [],
      judge: {
        groundedness: 0,
        refusal_appropriate: true,
        unsupported_claims: false,
        note: '검색 결과 없음 — 사전 규칙에 의한 자동 거절 (LLM 호출 생략)',
      },
    });
    renderMessages();
    return;
  }

  const assistantMsg: Message = { role: 'assistant', text: '', citations: retrieved, streaming: true };
  thread.push(assistantMsg);
  renderMessages();
  setSending(true);

  const sys = buildSystemPrompt(todayISO());
  const usr = buildUserPrompt(question, retrieved);

  currentStream = streamAnswer(
    apiKey,
    sys,
    usr,
    (delta) => {
      assistantMsg.text += delta;
      if (assistantMsg.bubbleEl) {
        assistantMsg.bubbleEl.innerHTML = escapeHtml(assistantMsg.text).replace(/\[(\d+)\]/g, '<span class="cite">[$1]</span>');
        $('#msg-scroll').scrollTop = $('#msg-scroll').scrollHeight;
      }
    },
    async (full) => {
      assistantMsg.streaming = false;
      assistantMsg.judging = true;
      currentStream = null;
      setSending(false);
      renderMessages();
      try {
        const judge = await judgeAnswer(apiKey, question, retrieved, full || assistantMsg.text);
        assistantMsg.judge = judge;
      } catch {
        assistantMsg.judge = {
          groundedness: 0,
          refusal_appropriate: null,
          unsupported_claims: false,
          note: '판정 실패',
        };
      }
      assistantMsg.judging = false;
      renderMessages();
    },
    (err) => {
      assistantMsg.streaming = false;
      assistantMsg.text = assistantMsg.text || `오류가 발생했어요: ${err.message}`;
      currentStream = null;
      setSending(false);
      renderMessages();
    }
  );
}

function setSending(sending: boolean) {
  const btn = $('#send-btn') as HTMLButtonElement;
  const input = $('#chat-input') as HTMLInputElement;
  input.disabled = sending;
  btn.classList.toggle('cancel', sending);
  btn.setAttribute('data-icon', sending ? 'stop' : 'send');
  hydrateIcons(btn.parentElement!);
  btn.onclick = null;
}

function updateWeightHelp() {
  const bm25Pct = Math.round((1 - cosineWeight) * 100);
  const cosPct = Math.round(cosineWeight * 100);
  $('#weight-help').textContent = `현재: BM25 ${bm25Pct}% · 코사인 ${cosPct}%`;
}

// ---------------- modal ----------------
function openSourceModal(c: RetrievedChunk) {
  const kind = badgeKindFor(c.source);
  const labelMap: Record<string, string> = { official: '● 후킹포인트 공식', founder: '◆ 대표 확인', industry: '○ 업계 일반' };
  $('#modal-badge').innerHTML = `<span class="chip chip-${kind}">${labelMap[kind]} · ${escapeHtml(c.source)}</span>`;
  $('#modal-title').textContent = `[${c.refIndex}] ${c.title} (${c.section})`;
  $('#modal-text').textContent = c.text;
  $('#modal-url').textContent = c.url + (c.deadline ? `  ·  마감일: ${c.deadline}` : '');
  $('#modal-backdrop').classList.add('is-open');
}

// ---------------- wiring ----------------
function initVectorStore() {
  const statusEl = $('#vector-status') as HTMLElement;
  statusEl.style.display = 'flex';
  statusEl.textContent = '벡터스토어 준비 중… 0%';
  loadEmbeddings((pct) => {
    if (pct >= 1) {
      statusEl.style.display = 'none';
      return;
    }
    statusEl.textContent = `벡터스토어 준비 중… ${Math.round(pct * 100)}%`;
  }).catch(() => {
    statusEl.textContent = '벡터스토어를 불러오지 못했어요 — 키워드 검색으로만 동작해요';
    setTimeout(() => (statusEl.style.display = 'none'), 4000);
  });
}

function init() {
  hydrateIcons(document);
  renderCatList();
  initVectorStore();
  ($('#weight-slider') as HTMLInputElement).value = String(cosineWeight);
  updateWeightHelp();

  $$('.nav-btn').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.getAttribute('data-tab') as any))
  );

  $('#chat-back').addEventListener('click', () => switchTab('home'));

  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    if (currentStream) {
      currentStream.cancel();
      currentStream = null;
      setSending(false);
      return;
    }
    sendMessage();
  });

  $('#go-settings-from-warning').addEventListener('click', () => switchTab('settings'));

  $('#save-key-btn').addEventListener('click', () => {
    apiKey = ($('#api-key-input') as HTMLInputElement).value.trim();
    localStorage.setItem(KEY_STORAGE, apiKey);
    const toast = $('#save-toast') as HTMLElement;
    toast.style.display = 'inline';
    setTimeout(() => (toast.style.display = 'none'), 1600);
    if (activeCategory) renderChatHeader();
  });

  $('#weight-slider').addEventListener('input', (e) => {
    cosineWeight = parseFloat((e.target as HTMLInputElement).value);
    localStorage.setItem(WEIGHT_STORAGE, String(cosineWeight));
    updateWeightHelp();
  });

  $('#clear-chats-btn').addEventListener('click', () => {
    if (!confirm('모든 카테고리의 대화 내용을 지울까요?')) return;
    CATEGORIES.forEach((c) => threads.set(c, []));
    if (activeCategory) renderMessages();
  });

  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-backdrop').addEventListener('click', (e) => {
    if (e.target === $('#modal-backdrop')) closeModal();
  });
}

init();
