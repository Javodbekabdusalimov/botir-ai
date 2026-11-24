/** 150000 -> "150 000 so'm" (SSR/CSR bir xil: locale'siz qo'lda) */
export function formatSom(n: number): string {
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${s} so'm`;
}

const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];

/** ISO -> "24 noy, 14:30" (UTC'ga bog'liq emas: lokal vaqt faqat clientda chaqiriladi) */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

export const CATEGORY_LABEL: Record<string, string> = {
  restaurant: "Restoran / oshxona",
  shop: "Do'kon",
  autoservice: "Avtoservis",
  clinic: "Klinika",
  beauty: "Go'zallik saloni",
  other: "Boshqa",
};

export function shortId(id: string): string {
  return id.slice(0, 4).toUpperCase();
}
