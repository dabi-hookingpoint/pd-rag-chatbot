import type { JudgeResult, RetrievedChunk } from './types';

const MODEL = 'gemini-flash-lite-latest';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function buildContextBlock(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c) => {
      const deadlineLine = c.deadline ? `\n마감일: ${c.deadline}` : '';
      return `[${c.refIndex}] 카테고리: ${c.category} | 출처: ${c.source} | 제목: ${c.title} (${c.section})${deadlineLine}\n${c.text}`;
    })
    .join('\n\n');
}

export function buildSystemPrompt(todayISO: string): string {
  return `당신은 영화·드라마 제작사 "후킹포인트"의 문의 안내 챗봇입니다.
반드시 아래에 제공되는 근거 자료(번호가 매겨진 청크)만 사용해서 답변하세요.
규칙:
1. 청크에 없는 내용은 절대 지어내지 마세요. 자료에 답이 없으면 "제공된 자료에서는 확인되지 않았어요"라고 명시하고, 관련 문의처(이메일)를 안내하세요.
2. 답변 문장 끝에는 그 문장이 근거로 삼은 청크 번호를 [1] 처럼 표시하세요. 여러 청크를 썼다면 [1][3]처럼 모두 표시하세요.
3. 오늘 날짜는 ${todayISO} 입니다. 청크에 마감일(deadline)이 있으면 오늘 날짜와 비교해서 이미 마감되었는지 반드시 판단해 알려주세요.
4. 청크 출처가 "대표확인"인 경우, 이는 아직 공식 홈페이지에 게시되지 않은 대표 확인 1차 정보임을 답변에서 자연스럽게 알 수 있게 하세요.
5. 출처가 후킹포인트/대표확인이 아닌 일반 기관(KOFIC, KOCCA, 문화체육관광부 등) 청크로만 답하는 경우, "이건 후킹포인트만의 정보가 아니라 업계 일반 기준이에요"라는 취지를 답변에 한 번 언급하세요.
6. 간결하고 친절한 존댓말로, 2~5문장 내외로 답하세요.`;
}

export function buildUserPrompt(question: string, chunks: RetrievedChunk[]): string {
  if (!chunks.length) {
    return `[검색된 근거 자료 없음]\n\n사용자 질문: ${question}`;
  }
  return `다음은 검색된 근거 자료입니다:\n\n${buildContextBlock(chunks)}\n\n사용자 질문: ${question}`;
}

export interface StreamHandle {
  cancel: () => void;
}

export function streamAnswer(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  onToken: (delta: string) => void,
  onDone: (full: string) => void,
  onError: (err: Error) => void
): StreamHandle {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        `${API_BASE}/${MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.4, thinkingConfig: { thinkingBudget: 512 } },
          }),
        }
      );

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        let friendly = '';
        try {
          const parsed = JSON.parse(text);
          friendly = parsed?.error?.message || '';
        } catch {
          // ignore parse failure, fall back to raw text
        }
        if (res.status === 400 && /api key not valid/i.test(friendly)) {
          throw new Error('API 키가 유효하지 않아요. 설정 탭에서 키를 다시 확인해주세요.');
        }
        throw new Error(friendly || `API 오류 (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') ?? '';
            if (delta) {
              full += delta;
              onToken(delta);
            }
          } catch {
            // partial JSON line, ignore
          }
        }
      }
      onDone(full);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return { cancel: () => controller.abort() };
}

const JUDGE_PROMPT = `당신은 RAG 챗봇 답변을 채점하는 심사자입니다. 아래 질문/근거자료/답변을 보고 JSON만 출력하세요. 다른 설명은 절대 쓰지 마세요.
형식: {"groundedness": 0.0~1.0 숫자, "refusal_appropriate": true/false/null(거절 상황이 아니면 null), "unsupported_claims": true/false, "note": "한 문장 코멘트(한국어)"}
groundedness는 답변의 각 문장이 실제로 제공된 근거자료에 있는 내용인지를 기준으로 채점하세요. 근거자료에 없는 내용을 답변이 만들어냈다면 unsupported_claims를 true로, groundedness를 낮게 주세요.`;

export async function judgeAnswer(
  apiKey: string,
  question: string,
  chunks: RetrievedChunk[],
  answer: string
): Promise<JudgeResult> {
  const context = chunks.length ? buildContextBlock(chunks) : '[검색된 근거 자료 없음]';
  const body = {
    systemInstruction: { parts: [{ text: JUDGE_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `질문: ${question}\n\n근거자료:\n${context}\n\n답변:\n${answer}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 256 },
    },
  };

  const res = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const fallback: JudgeResult = {
    groundedness: 0,
    refusal_appropriate: null,
    unsupported_claims: false,
    note: '판정 실패 (API 응답 파싱 불가)',
  };

  if (!res.ok) return fallback;
  try {
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      groundedness: typeof parsed.groundedness === 'number' ? parsed.groundedness : 0,
      refusal_appropriate: parsed.refusal_appropriate ?? null,
      unsupported_claims: !!parsed.unsupported_claims,
      note: typeof parsed.note === 'string' ? parsed.note : '',
    };
  } catch {
    return fallback;
  }
}
