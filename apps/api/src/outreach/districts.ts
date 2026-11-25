// Tashkent districts: stem → canonical name. Uzbek suffixes ("Chilonzorda", "Yunusobodga") keep the stem intact.
const DISTRICTS: ReadonlyArray<readonly [stem: string, name: string]> = [
  ['chilonzor', 'Chilonzor'],
  ['yunusobod', 'Yunusobod'],
  ['ulugbek', "Mirzo Ulug'bek"],
  ['yakkasaroy', 'Yakkasaroy'],
  ['shayxontohur', 'Shayxontohur'],
  ['shayhontohur', 'Shayxontohur'],
  ['sergeli', 'Sergeli'],
  ['mirobod', 'Mirobod'],
  ['olmazor', 'Olmazor'],
  ['uchtepa', 'Uchtepa'],
  ['bektemir', 'Bektemir'],
  ['yashnobod', 'Yashnobod'],
  ['yangihayot', 'Yangihayot'],
];

const fold = (s: string): string => s.toLowerCase().replace(/[ʻʼ'‘’`\s-]/g, '');

/** All distinct districts a free text names, in text order. */
export function districtsIn(text: string): string[] {
  const t = fold(text);
  const hits = DISTRICTS.flatMap(([stem, name]) => (t.includes(stem) ? [{ name, at: t.indexOf(stem) }] : []));
  return [...new Set(hits.sort((a, b) => a.at - b.at).map((h) => h.name))];
}

/** "Chilonzorda" → "Chilonzor"; undefined when no known district is named. */
export const canonicalDistrict = (text: string | undefined): string | undefined => (text ? districtsIn(text)[0] : undefined);
