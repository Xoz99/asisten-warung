// Cosine similarity antar 2 vektor embedding (dari MobileNet buat produk, atau face descriptor buat pelanggan).
// Nerima array angka langsung, atau string JSON (kayak yang balik dari kolom JSONB Postgres).
export function cosineSimilarity(a, b) {
  const v1 = typeof a === 'string' ? JSON.parse(a) : a;
  const v2 = typeof b === 'string' ? JSON.parse(b) : b;
  const len = Math.min(v1.length, v2.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    dot += v1[i] * v2[i];
    na += v1[i] * v1[i];
    nb += v2[i] * v2[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
