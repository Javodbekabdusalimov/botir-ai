// Client for the local embed-server (bge-m3, 1024 dims). ONLY /embed — never /add (owner's private index).

export class EmbedClient {
  constructor(private readonly baseUrl = process.env.EMBED_URL ?? 'http://127.0.0.1:8766') {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch(`${this.baseUrl}/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts }),
    });
    if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { vectors?: number[][] };
    if (!Array.isArray(body.vectors)) throw new Error('embed: no vectors in response');
    return body.vectors;
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function topK<T>(query: number[], items: { item: T; vector: number[] }[], k: number): { item: T; score: number }[] {
  return items
    .map(({ item, vector }) => ({ item, score: cosine(query, vector) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, k);
}
