function bigrams(s: string): string[] {
  if (s.length <= 2) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

export function tokenize(text: string): string[] {
  const runs = text.toLowerCase().match(/[\p{Script=Hangul}]+|[a-z0-9]+/gu) || [];
  const tokens: string[] = [];
  for (const run of runs) {
    if (/[\p{Script=Hangul}]/u.test(run)) {
      tokens.push(...bigrams(run));
    } else {
      tokens.push(run);
    }
  }
  return tokens;
}

interface IndexedDoc {
  id: string;
  tokens: string[];
  len: number;
}

export class BM25 {
  private docs: IndexedDoc[] = [];
  private df = new Map<string, number>();
  private avgLen = 0;
  private readonly k1 = 1.5;
  private readonly b = 0.75;

  constructor(items: { id: string; text: string }[]) {
    for (const item of items) {
      const tokens = tokenize(item.text);
      this.docs.push({ id: item.id, tokens, len: tokens.length });
      const seen = new Set(tokens);
      for (const t of seen) this.df.set(t, (this.df.get(t) || 0) + 1);
    }
    this.avgLen = this.docs.reduce((a, d) => a + d.len, 0) / (this.docs.length || 1);
  }

  private idf(term: string): number {
    const n = this.docs.length;
    const df = this.df.get(term) || 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query: string, ids: Set<string> | null, topK = 5): { id: string; score: number }[] {
    const qTokens = tokenize(query);
    if (!qTokens.length) return [];
    const pool = ids ? this.docs.filter((d) => ids.has(d.id)) : this.docs;
    const scores = pool.map((doc) => {
      const tf = new Map<string, number>();
      for (const t of doc.tokens) tf.set(t, (tf.get(t) || 0) + 1);
      let score = 0;
      for (const term of qTokens) {
        const f = tf.get(term) || 0;
        if (!f) continue;
        const idf = this.idf(term);
        score +=
          (idf * (f * (this.k1 + 1))) /
          (f + this.k1 * (1 - this.b + (this.b * doc.len) / (this.avgLen || 1)));
      }
      return { id: doc.id, score };
    });
    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}
