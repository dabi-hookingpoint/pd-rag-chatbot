"""results.json에서 [ERROR로 시작하는 실패 항목만 다시 돌려서 제자리에 병합한다."""
import json
import sys
import time
from pathlib import Path

api_key = sys.argv[1] if len(sys.argv) > 1 else ""
results_file = sys.argv[2] if len(sys.argv) > 2 else "results.json"
top_k = sys.argv[3] if len(sys.argv) > 3 else "5"

sys.path.insert(0, str(Path(__file__).parent))
sys.argv = ["run_eval.py", api_key, top_k]
import run_eval as E  # noqa: E402

results_path = Path(__file__).parent / results_file
results = json.loads(results_path.read_text(encoding="utf-8"))

today = __import__("datetime").date.today().isoformat()
by_id = {q["id"]: q for q in E.QUESTIONS}

for r in results:
    if not r["answer"].startswith("[ERROR"):
        continue
    print(f"retrying {r['id']} {r['question']}", file=sys.stderr)
    time.sleep(15)  # RPM 창을 넉넉히 흘려보냄
    item = by_id[r["id"]]
    chunks = E.retrieve(item["category"], item["q"])
    sys_prompt = E.build_system_prompt(today)
    user_prompt = E.build_user_prompt(item["q"], chunks)
    answer = E.call_gemini(sys_prompt, user_prompt, retries=5)
    j = E.judge(item["q"], chunks, answer) if not answer.startswith("[ERROR") else r["judge"]
    r["retrieved_ids"] = [c["id"] for c in chunks]
    r["retrieved_count"] = len(chunks)
    r["answer"] = answer
    r["judge"] = j
    results_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

print("done", file=sys.stderr)
