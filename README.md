# 후킹포인트 문의 안내 RAG 챗봇

영화·드라마 제작사 "후킹포인트"에 대한 문의(제작 라인업 / IP 기획 / 편집 / 후반작업 / 회사 소개)에 공개 자료를 근거로 답하는 RAG 챗봇입니다. Main Quest 3 과제 산출물이며, 설계 배경은 [PRD.md](./PRD.md)에 있습니다.

**배포 URL**: https://dabi-hookingpoint.github.io/pd-rag-chatbot/
**저장소**: https://github.com/dabi-hookingpoint/pd-rag-chatbot

## 사용 방법

1. 배포 URL 접속 (또는 아래 "로컬 실행")
2. 하단 **설정** 탭에서 Gemini API 키 입력 후 저장 — 키는 브라우저 로컬 저장소에만 저장되고 서버로 전송되지 않습니다
3. **홈**에서 문의 카테고리 선택 → 질문 입력

### API 키 발급 (무료)

1. [Google AI Studio](https://aistudio.google.com/apikey)에 구글 계정으로 로그인
2. "Create API key" 클릭 → 발급된 키를 복사
3. 이 앱의 설정 탭에 붙여넣기 (무료 티어로 충분히 테스트 가능)

## 로컬 실행

```bash
npm install
npm run dev
```

`npm run build`로 정적 빌드(`dist/`)를 생성할 수 있습니다.

## 프로젝트 구조

```
pd-rag-chatbot/
├── PRD.md                    # 기획 문서 (문제정의/타겟유저/MVP/근거자료계획/화면구성)
├── data/chunks.json          # RAG 코퍼스 — 사실 단위 청크 (id·category·source·title·section·url·text·deadline·fetched_at)
├── sources/hookingpoint-facts.md  # 아직 공식 사이트에 게시되지 않은 대표 확인 1차 정보의 출처
├── index.html
├── src/
│   ├── main.ts                # 앱 로직 (탭 전환, 검색, 답변 생성, 판정, 피드백)
│   ├── bm25.ts                 # 키워드 검색(BM25, 한글 bigram 토크나이저)
│   ├── llm.ts                  # Gemini API 스트리밍 답변 생성 + LLM-as-Judge 판정
│   ├── types.ts                 # 카테고리/청크/출처 배지 타입 및 상수
│   ├── icons.ts                 # 인라인 SVG 아이콘
│   └── style.css
└── public/favicon.png          # 실제 회사 로고
```

## 평가 결과

37개 문항을 실제 Gemini API로 돌린 결과와 top-k(근거 개수) 5 vs 2 비교 실험은 [eval/RESULTS.md](eval/RESULTS.md)에 있습니다. 기본 설정(top-k=5) 기준 37문항 중 34개(92%)가 자동채점 통과, 나머지 3개도 직접 확인해보니 실제로는 정확히 답했고 원인은 채점 스크립트 쪽 규칙이었습니다.

## 현재 한계 (정직하게 밝힘)

- **검색은 BM25 키워드 검색만 사용합니다.** PRD가 계획한 임베딩 기반 코사인 유사도 + BM25 하이브리드 검색은 아직 구현하지 않았습니다. 다음 업데이트에서 브라우저 임베딩(transformers.js)을 추가할 예정입니다.
- **생성 엔진은 Gemini만 지원**합니다(BYOK). OpenAI 등 엔진 선택 기능은 아직 없습니다.
- 근거가 없는 질문에는 LLM을 호출하지 않고 사전 규칙으로 즉시 "확인되지 않음"을 안내합니다 — 이 판단은 BM25 점수 기준이라, 키워드가 겹치지 않는데 실제로는 관련 있는 질문을 놓칠 수 있습니다(임베딩 검색이 추가되면 개선될 지점).

## 데이터 출처

- 후킹포인트 공식(필모그래피, 연락처, IP 열람 정책): 사이트 게시 콘텐츠 기준
- 대표확인(라인업 현황, VFX 협업, AI 작업 파이프라인 등): `sources/hookingpoint-facts.md` — 대표가 직접 확인해 준 1차 정보, 아직 공식 사이트 미게시
- 업계일반(KOFIC/KOCCA/문화체육관광부 등 표준계약서·실태조사): 각 청크의 `url` 필드에 원문 링크
