"""
Main Quest 3 실험 & 평가 실행 스크립트.

src/bm25.ts, src/llm.ts와 동일한 알고리즘/프롬프트를 파이썬으로 그대로 옮겨서,
questions.json의 37문항을 실제 Gemini API로 돌리고 결과를 results.json에 기록한다.
브라우저를 37번 조작하는 대신, 앱과 동일한 검색/프롬프트 로직을 재사용해 배치로 실행한다.
"""

import json
import math
import re
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent.parent
API_KEY = sys.argv[1] if len(sys.argv) > 1 else None
if not API_KEY:
    print("usage: python3 run_eval.py <GEMINI_API_KEY> [top_k] [out_name]")
    sys.exit(1)

TOP_K = int(sys.argv[2]) if len(sys.argv) > 2 else 5
OUT_NAME = sys.argv[3] if len(sys.argv) > 3 else "results"

MODEL = "gemini-flash-lite-latest"
API_BASE = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}"

CHUNKS = json.loads((ROOT / "data" / "chunks.json").read_text(encoding="utf-8"))
QUESTIONS = json.loads((Path(__file__).parent / "questions.json").read_text(encoding="utf-8"))


# ---------------- BM25 (src/bm25.ts 포팅) ----------------

def bigrams(s):
    if len(s) <= 2:
        return [s]
    return [s[i:i + 2] for i in range(len(s) - 1)]


HANGUL_RE = re.compile(r"[가-힣]+|[a-z0-9]+")


def tokenize(text):
    tokens = []
    for run in HANGUL_RE.findall(text.lower()):
        if re.match(r"[가-힣]", run):
            tokens.extend(bigrams(run))
        else:
            tokens.append(run)
    return tokens


class BM25:
    def __init__(self, items):
        self.docs = []
        self.df = {}
        for item in items:
            tokens = tokenize(item["text"])
            self.docs.append({"id": item["id"], "tokens": tokens, "len": len(tokens)})
            for t in set(tokens):
                self.df[t] = self.df.get(t, 0) + 1
        self.avg_len = sum(d["len"] for d in self.docs) / max(len(self.docs), 1)
        self.k1, self.b = 1.5, 0.75

    def idf(self, term):
        n = len(self.docs)
        df = self.df.get(term, 0)
        return math.log(1 + (n - df + 0.5) / (df + 0.5))

    def search(self, query, ids, top_k=5):
        q_tokens = tokenize(query)
        if not q_tokens:
            return []
        pool = [d for d in self.docs if d["id"] in ids] if ids is not None else self.docs
        scores = []
        for doc in pool:
            tf = {}
            for t in doc["tokens"]:
                tf[t] = tf.get(t, 0) + 1
            score = 0.0
            for term in q_tokens:
                f = tf.get(term, 0)
                if not f:
                    continue
                idf = self.idf(term)
                score += (idf * (f * (self.k1 + 1))) / (
                    f + self.k1 * (1 - self.b + self.b * doc["len"] / (self.avg_len or 1))
                )
            scores.append((doc["id"], score))
        scores.sort(key=lambda x: -x[1])
        return scores[:top_k]


bm25 = BM25([{"id": c["id"], "text": f"{c['title']} {c['section']} {c['text']}"} for c in CHUNKS])
CHUNK_BY_ID = {c["id"]: c for c in CHUNKS}


def retrieve(category, query, top_k=TOP_K):
    ids = {c["id"] for c in CHUNKS if c["category"] == category}
    hits = [h for h in bm25.search(query, ids, top_k) if h[1] > 0]
    out = []
    for i, (cid, score) in enumerate(hits):
        c = dict(CHUNK_BY_ID[cid])
        c["score"] = score
        c["refIndex"] = i + 1
        out.append(c)
    return out


# ---------------- 프롬프트 (src/llm.ts 포팅) ----------------

def build_context_block(chunks):
    parts = []
    for c in chunks:
        deadline_line = f"\n마감일: {c['deadline']}" if c.get("deadline") else ""
        parts.append(
            f"[{c['refIndex']}] 카테고리: {c['category']} | 출처: {c['source']} | 제목: {c['title']} ({c['section']}){deadline_line}\n{c['text']}"
        )
    return "\n\n".join(parts)


def build_system_prompt(today_iso):
    return f"""당신은 영화·드라마 제작사 "후킹포인트"의 문의 안내 챗봇입니다.
반드시 아래에 제공되는 근거 자료(번호가 매겨진 청크)만 사용해서 답변하세요.
규칙:
1. 청크에 없는 내용은 절대 지어내지 마세요. 자료에 답이 없으면 "제공된 자료에서는 확인되지 않았어요"라고 명시하고, 관련 문의처(이메일)를 안내하세요.
2. 답변 문장 끝에는 그 문장이 근거로 삼은 청크 번호를 [1] 처럼 표시하세요. 여러 청크를 썼다면 [1][3]처럼 모두 표시하세요.
3. 오늘 날짜는 {today_iso} 입니다. 청크에 마감일(deadline)이 있으면 오늘 날짜와 비교해서 이미 마감되었는지 반드시 판단해 알려주세요.
4. 청크 출처가 "대표확인"인 경우, 이는 아직 공식 홈페이지에 게시되지 않은 대표 확인 1차 정보임을 답변에서 자연스럽게 알 수 있게 하세요.
5. 출처가 후킹포인트/대표확인이 아닌 일반 기관(KOFIC, KOCCA, 문화체육관광부 등) 청크로만 답하는 경우, "이건 후킹포인트만의 정보가 아니라 업계 일반 기준이에요"라는 취지를 답변에 한 번 언급하세요.
6. 간결하고 친절한 존댓말로, 2~5문장 내외로 답하세요."""


def build_user_prompt(question, chunks):
    if not chunks:
        return f"[검색된 근거 자료 없음]\n\n사용자 질문: {question}"
    return f"다음은 검색된 근거 자료입니다:\n\n{build_context_block(chunks)}\n\n사용자 질문: {question}"


JUDGE_PROMPT = """당신은 RAG 챗봇 답변을 채점하는 심사자입니다. 아래 질문/근거자료/답변을 보고 JSON만 출력하세요. 다른 설명은 절대 쓰지 마세요.
형식: {"groundedness": 0.0~1.0 숫자, "refusal_appropriate": true/false/null(거절 상황이 아니면 null), "unsupported_claims": true/false, "note": "한 문장 코멘트(한국어)"}
groundedness는 답변의 각 문장이 실제로 제공된 근거자료에 있는 내용인지를 기준으로 채점하세요. 근거자료에 없는 내용을 답변이 만들어냈다면 unsupported_claims를 true로, groundedness를 낮게 주세요."""


# ---------------- Gemini 호출 ----------------

def call_gemini(system_prompt, user_prompt, json_mode=False, retries=3):
    body = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": 0.4 if not json_mode else 0,
            "thinkingConfig": {"thinkingBudget": 512},
        },
    }
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"
    data = json.dumps(body)

    last_err = None
    for attempt in range(retries):
        try:
            proc = subprocess.run(
                [
                    "curl", "-sS", "--max-time", "60",
                    "-X", "POST",
                    f"{API_BASE}:generateContent?key={API_KEY}",
                    "-H", "Content-Type: application/json",
                    "-d", data,
                ],
                capture_output=True, text=True, timeout=70,
            )
            if proc.returncode != 0:
                last_err = f"curl exit {proc.returncode}: {proc.stderr[:200]}"
                time.sleep(2)
                continue
            parsed = json.loads(proc.stdout)
            if "error" in parsed:
                last_err = f"API error: {json.dumps(parsed['error'])[:200]}"
                time.sleep(2)
                continue
            parts = parsed.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            return "".join(p.get("text", "") for p in parts)
        except Exception as e:  # noqa: BLE001
            last_err = str(e)
        time.sleep(2)
    return f"[ERROR after {retries} retries: {last_err}]"


def judge(question, chunks, answer):
    context = build_context_block(chunks) if chunks else "[검색된 근거 자료 없음]"
    user_prompt = f"질문: {question}\n\n근거자료:\n{context}\n\n답변:\n{answer}"
    raw = call_gemini(JUDGE_PROMPT, user_prompt, json_mode=True)
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except Exception:  # noqa: BLE001
        return {"groundedness": None, "refusal_appropriate": None, "unsupported_claims": None, "note": f"판정 파싱 실패: {raw[:150]}"}


# ---------------- 실행 ----------------

def run():
    today = date.today().isoformat()
    results = []
    total = len(QUESTIONS)
    for i, item in enumerate(QUESTIONS, 1):
        qid, category, question, expected = item["id"], item["category"], item["q"], item["expected"]
        t0 = time.time()
        print(f"[{i}/{total}] ({category}) {question}", file=sys.stderr, flush=True)

        chunks = retrieve(category, question)

        if not chunks:
            answer = "제공된 자료에서는 확인되지 않았어요. 위의 문의 버튼으로 직접 연락해주시면 정확히 안내해드릴게요."
            j = {"groundedness": 0, "refusal_appropriate": True, "unsupported_claims": False, "note": "검색 결과 없음 — 사전 규칙에 의한 자동 거절 (LLM 호출 생략)"}
        else:
            sys_prompt = build_system_prompt(today)
            user_prompt = build_user_prompt(question, chunks)
            t_ans = time.time()
            answer = call_gemini(sys_prompt, user_prompt)
            print(f"    answer in {time.time()-t_ans:.1f}s", file=sys.stderr, flush=True)
            t_judge = time.time()
            j = judge(question, chunks, answer)
            print(f"    judge in {time.time()-t_judge:.1f}s", file=sys.stderr, flush=True)

        print(f"    total {time.time()-t0:.1f}s", file=sys.stderr, flush=True)

        results.append(
            {
                "id": qid,
                "category": category,
                "question": question,
                "expected": expected,
                "retrieved_ids": [c["id"] for c in chunks],
                "retrieved_count": len(chunks),
                "answer": answer,
                "judge": j,
            }
        )
        (Path(__file__).parent / f"{OUT_NAME}.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    print(f"done: {len(results)} results -> eval/{OUT_NAME}.json", file=sys.stderr)


if __name__ == "__main__":
    run()
