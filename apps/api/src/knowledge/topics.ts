// Topic detection by keywords (no LLM): FAQ answers get a topic, metrics see which topics are still missing.
// Same topic names as the extractor (delivery | payment | booking | parking | return | …).

const TOPIC_PATTERNS: [topic: string, re: RegExp][] = [
  ['delivery', /delivery|yetkaz|dostavka|доставк/i],
  ['payment', /payment|to['‘’ʻ`]?lov|naqd|karta|click|payme|uzum|nasiya|оплат|наличн|карт[аоуы]/i],
  ['booking', /booking|band qil|bron|joy buyurt|navbat|yozil|брон|запис/i],
  ['parking', /parking|parkovka|avtoturargoh|turargoh|парков/i],
  ['return', /return|qaytar|almashtirib ber|возврат|обмен/i],
  ['warranty', /warranty|kafolat|garanti|гаранти/i],
  ['address', /manzil|mo['‘’ʻ`]?ljal|address|адрес/i],
];

export const OTHER_TOPIC = 'other';

export function topicOf(text: string): string {
  return TOPIC_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? OTHER_TOPIC;
}

const DEFAULT_TOPICS = ['delivery', 'payment', 'booking'];
const TOPICS_BY_CATEGORY: Record<string, string[]> = {
  shop: ['delivery', 'payment', 'return'],
  autoservice: ['payment', 'booking', 'warranty'],
  clinic: ['payment', 'booking'],
  beauty: ['payment', 'booking'],
};

/** What customers of this kind of business ask most; `profile` and `catalog` are always required. */
export const requiredTopics = (category: string): string[] => TOPICS_BY_CATEGORY[category] ?? DEFAULT_TOPICS;
