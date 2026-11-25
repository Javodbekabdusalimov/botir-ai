/** "45.000", "45,000", "45 000", "45000" → 45000. Narx emas → null. */
export function parsePrice(v: string): number | null {
  const s = v.replace(/[\s ]/g, "").replace(/so'?m/gi, "");
  if (!s) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ""));
  return /^\d+$/.test(s) ? Number(s) : null;
}

/** Iqtibosdagi barcha narx raqamlari ("Osh 45.000" → [45000]). */
export function pricesIn(text: string): number[] {
  return (text.match(/\d{1,3}(?:[ ., ]\d{3})+|\d+/g) ?? []).map(parsePrice).filter((n): n is number => n !== null);
}
