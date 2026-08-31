import json
import sys
from pathlib import Path

IN_NAME = sys.argv[1] if len(sys.argv) > 1 else "results.json"
OUT_NAME = sys.argv[2] if len(sys.argv) > 2 else "results_scored.json"

results = json.loads((Path(__file__).parent / IN_NAME).read_text(encoding="utf-8"))


def verdict(r):
    exp = r["expected"]
    g = r["judge"].get("groundedness")
    refusal_ok = r["judge"].get("refusal_appropriate")
    is_auto_refuse = r["retrieved_count"] == 0
    has_industry_phrase = "업계 일반" in r["answer"]

    if exp == "refuse":
        if is_auto_refuse:
            return True, "검색결과 0건 → 사전규칙 자동거절"
        if refusal_ok is True:
            return True, "LLM이 자료 없음을 인지하고 정직히 거절"
        return False, f"거절 기대했지만 근거성={g}, refusal_appropriate={refusal_ok}"

    if exp == "industry_label":
        ok = (g is not None and g >= 0.6) and has_industry_phrase
        reason = []
        if g is None or g < 0.6:
            reason.append(f"근거성 낮음({g})")
        if not has_industry_phrase:
            reason.append("업계일반 라벨 문구 누락")
        return ok, ("정상" if ok else "; ".join(reason))

    # grounded
    ok = g is not None and g >= 0.6 and not is_auto_refuse
    reason = "정상" if ok else f"근거성 낮음({g}) 또는 근거 미검색"
    return ok, reason


rows = []
for r in results:
    ok, reason = verdict(r)
    rows.append({**r, "pass": ok, "reason": reason})

by_cat = {}
for r in rows:
    by_cat.setdefault(r["category"], []).append(r)

print("## 카테고리별 결과\n")
print("| 카테고리 | 문항수 | 통과 | 통과율 |")
print("|---|---|---|---|")
total_pass = 0
for cat, items in by_cat.items():
    p = sum(1 for i in items if i["pass"])
    total_pass += p
    print(f"| {cat} | {len(items)} | {p} | {p/len(items)*100:.0f}% |")
print(f"| **전체** | **{len(rows)}** | **{total_pass}** | **{total_pass/len(rows)*100:.0f}%** |")

print("\n## 문항별 상세\n")
print("| # | 카테고리 | 질문 | 기대 | 근거성 | 판정 | 사유 |")
print("|---|---|---|---|---|---|---|")
for r in rows:
    mark = "✅" if r["pass"] else "❌"
    g = r["judge"].get("groundedness")
    g_str = f"{g:.2f}" if isinstance(g, (int, float)) else "-"
    q = r["question"][:28] + ("…" if len(r["question"]) > 28 else "")
    print(f"| {r['id']} | {r['category']} | {q} | {r['expected']} | {g_str} | {mark} | {r['reason']} |")

print("\n## 실패 사례\n")
fails = [r for r in rows if not r["pass"]]
if not fails:
    print("없음 — 37문항 전부 기대대로 동작.")
else:
    for r in fails:
        print(f"- **[{r['id']}] {r['question']}** (카테고리: {r['category']}, 기대: {r['expected']})")
        print(f"  - 원인: {r['reason']}")
        print(f"  - 실제 답변: {r['answer'][:200]}")

Path(__file__).with_name(OUT_NAME).write_text(
    json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
)
