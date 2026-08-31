import { BM25 } from './bm25';
import { cosineSimilarity, embedQuery } from './embed';
import type { Chunk, RetrievedChunk } from './types';

// combined 점수가 이 값 미만이면 "근거 없음"으로 취급 (약한 근거 규칙)
const EVIDENCE_THRESHOLD = 0.12;
const CACHE_KEY = 'hp_rag_embeddings_v1';

const EMBEDDINGS = new Map<string, number[]>();
let vectorStoreReady = false;

export function isVectorStoreReady(): boolean {
  return vectorStoreReady;
}

/**
 * data/embeddings.json(정적 벡터스토어, ~320KB)을 런타임에 내려받는다.
 * localStorage에 캐시해 다음 방문부터는 재다운로드 없이 즉시 로드하고,
 * 첫 다운로드는 onProgress(0~1)로 진행률을 보고한다.
 */
export async function loadEmbeddings(onProgress: (pct: number) => void): Promise<void> {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { id: string; vector: number[] }[];
      parsed.forEach((e) => EMBEDDINGS.set(e.id, e.vector));
      vectorStoreReady = true;
      onProgress(1);
      return;
    } catch {
      localStorage.removeItem(CACHE_KEY);
    }
  }

  const res = await fetch('./data/embeddings.json');
  if (!res.ok || !res.body) throw new Error('벡터스토어 다운로드 실패');
  const total = Number(res.headers.get('content-length') || 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(Math.min(0.99, received / total));
  }
  const blob = new Blob(chunks as BlobPart[]);
  const text = await blob.text();
  const parsed = JSON.parse(text) as { id: string; vector: number[] }[];
  parsed.forEach((e) => EMBEDDINGS.set(e.id, e.vector));
  try {
    localStorage.setItem(CACHE_KEY, text);
  } catch {
    // localStorage 용량 초과 등은 무시 — 이번 세션만 메모리에 유지
  }
  vectorStoreReady = true;
  onProgress(1);
}

export interface HybridSearchOptions {
  bm25: BM25;
  chunkById: Map<string, Chunk>;
  category: string;
  query: string;
  apiKey: string | null;
  cosineWeight: number; // 0 (BM25만) ~ 1 (코사인만)
  topK: number;
}

export async function hybridRetrieve(opts: HybridSearchOptions): Promise<RetrievedChunk[]> {
  const { bm25, chunkById, category, query, apiKey, cosineWeight, topK } = opts;
  const ids = new Set(
    Array.from(chunkById.values()).filter((c) => c.category === category).map((c) => c.id)
  );
  if (ids.size === 0) return [];

  const bm25Hits = bm25.search(query, ids, ids.size);
  const bm25Map = new Map(bm25Hits.map((h) => [h.id, h.score]));
  const maxBm25 = Math.max(0, ...bm25Hits.map((h) => h.score));

  let queryVec: number[] | null = null;
  if (apiKey && cosineWeight > 0 && vectorStoreReady) {
    queryVec = await embedQuery(apiKey, query);
  }

  const scored = Array.from(ids).map((id) => {
    const rawBm25 = bm25Map.get(id) ?? 0;
    const normBm25 = maxBm25 > 0 ? rawBm25 / maxBm25 : 0;
    let cosine = 0;
    if (queryVec) {
      const vec = EMBEDDINGS.get(id);
      if (vec) cosine = Math.max(0, cosineSimilarity(queryVec, vec));
    }
    const w = queryVec ? cosineWeight : 0; // 임베딩 실패/미보유 시 BM25로 자동 폴백
    const combined = (1 - w) * normBm25 + w * cosine;
    return { id, combined, normBm25, cosine };
  });

  scored.sort((a, b) => b.combined - a.combined);
  const top = scored.filter((s) => s.combined >= EVIDENCE_THRESHOLD).slice(0, topK);

  return top.map((s, i) => ({
    ...(chunkById.get(s.id) as Chunk),
    score: s.combined,
    refIndex: i + 1,
  }));
}
