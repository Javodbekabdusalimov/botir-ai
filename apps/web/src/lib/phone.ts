/** "+998 90 123 45 67" ko'rinishidagi maska. Faqat raqamlarni oladi, 998 prefiksi doim bor. */
export function maskPhone(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("998")) d = d.slice(3);
  d = d.slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return `+998${parts.length ? " " + parts.join(" ") : ""}`;
}
/** "+998 90 123 45 67" -> "+998901234567" */
export const phoneDigits = (masked: string) => "+" + masked.replace(/\D/g, "");
export const isPhoneComplete = (masked: string) => masked.replace(/\D/g, "").length === 12;
