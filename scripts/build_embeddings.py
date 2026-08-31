"""
정적 벡터스토어 빌드 스크립트.

data/chunks.json의 각 청크를 Gemini 임베딩 API(gemini-embedding-001, 768차원,
taskType=RETRIEVAL_DOCUMENT)로 임베딩해 data/embeddings.json에 저장한다.
BM25 인덱싱과 동일한 텍스트(title + section + text)를 임베딩해 두 검색 방식의
입력을 일치시킨다. 브라우저는 이 파일을 그대로 로드하고, 사용자 질문만
RETRIEVAL_QUERY로 실시간 임베딩해 코사인 유사도를 계산한다(src/embed.ts).
"""

import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
API_KEY = sys.argv[1] if len(sys.argv) > 1 else None
if not API_KEY:
    print("usage: python3 build_embeddings.py <GEMINI_API_KEY>")
    sys.exit(1)

MODEL = "gemini-embedding-001"
DIM = 768
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:embedContent?key={API_KEY}"

CHUNKS = json.loads((ROOT / "data" / "chunks.json").read_text(encoding="utf-8"))
OUT_PATH = ROOT / "public" / "data" / "embeddings.json"


def embed(text, task_type, retries=4):
    body = json.dumps(
        {
            "content": {"parts": [{"text": text}]},
            "taskType": task_type,
            "outputDimensionality": DIM,
        }
    )
    last_err = None
    for _ in range(retries):
        proc = subprocess.run(
            ["curl", "-sS", "--max-time", "30", "-X", "POST", URL, "-H", "Content-Type: application/json", "-d", body],
            capture_output=True, text=True, timeout=40,
        )
        try:
            parsed = json.loads(proc.stdout)
        except Exception as e:  # noqa: BLE001
            last_err = str(e)
            time.sleep(3)
            continue
        if "embedding" in parsed:
            return parsed["embedding"]["values"]
        last_err = json.dumps(parsed)[:200]
        time.sleep(3)
    raise RuntimeError(f"embed failed after {retries} retries: {last_err}")


def main():
    out = []
    existing = {}
    if OUT_PATH.exists():
        for e in json.loads(OUT_PATH.read_text(encoding="utf-8")):
            existing[e["id"]] = e

    for i, c in enumerate(CHUNKS, 1):
        if c["id"] in existing:
            out.append(existing[c["id"]])
            print(f"[{i}/{len(CHUNKS)}] (cached) {c['id']}", file=sys.stderr)
            continue
        text = f"{c['title']} {c['section']} {c['text']}"
        print(f"[{i}/{len(CHUNKS)}] {c['id']}", file=sys.stderr, flush=True)
        vec = embed(text, "RETRIEVAL_DOCUMENT")
        out.append({"id": c["id"], "vector": vec})
        OUT_PATH.write_text(json.dumps(out, indent=0), encoding="utf-8")
        time.sleep(0.3)

    OUT_PATH.write_text(json.dumps(out, indent=0), encoding="utf-8")
    print(f"done: {len(out)} vectors -> {OUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
