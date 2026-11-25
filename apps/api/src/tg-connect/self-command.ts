// B2C: the user talks to their assistant from their own Telegram "Saved Messages" (chat with self).
// Only messages addressed to it ("Assistant, ..."; the old "Botir, ..." still works) are commands; everything else is ignored.

export type SelfCommand =
  | { kind: 'approve' }
  | { kind: 'reject' }
  | { kind: 'write'; name: string; text: string }
  | { kind: 'request'; text: string };

const ADDRESS_RE = /^\s*[/@]?(?:assistant|botir)\b[\s,:!.\-—]*/i;
const WRITE_RE = /^\s*(\S+?)(?:ga|ka|qa)\s+yoz\s*:\s*([\s\S]+)$/i;
const APPROVE = new Set(['ha', 'xa', 'ha yubor', 'yubor', 'yes', 'ok', 'да', 'ага']);
const REJECT = new Set(["yo'q", 'yoq', 'yo‘q', 'yo`q', "yo'q kerak emas", 'kerak emas', 'bekor', 'no', 'нет']);

const answerOf = (text: string): SelfCommand | null => {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, '');
  if (APPROVE.has(t)) return { kind: 'approve' };
  if (REJECT.has(t)) return { kind: 'reject' };
  return null;
};

/**
 * "Aliga yoz" → the chat titled "Ali" or "Ali Valiyev", never "Valijon (raqobatchi)": case-insensitive match on the
 * whole title, else on its first word. More than one match → null, so a message never goes to a guessed person.
 */
export function pickChatByName<T extends { title: string }>(chats: T[], name: string): T | null {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  const title = (c: T): string => c.title.trim().toLowerCase();
  const exact = chats.filter((c) => title(c) === want);
  const matches = exact.length > 0 ? exact : chats.filter((c) => title(c).split(/\s+/)[0] === want);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/** null = not for Botir. Plain "ha"/"yo'q" are answers to the latest pending action. */
export function parseSelfCommand(raw: string): SelfCommand | null {
  const text = raw ?? '';
  const plain = answerOf(text);
  if (plain) return plain;
  const prefix = ADDRESS_RE.exec(text);
  if (!prefix) return null;
  const body = text.slice(prefix[0].length).trim();
  if (!body) return null;
  const answer = answerOf(body);
  if (answer) return answer;
  const write = WRITE_RE.exec(body);
  if (write?.[1] && write[2]?.trim()) return { kind: 'write', name: write[1], text: write[2].trim() };
  return { kind: 'request', text: body };
}
