import type { LlmErrorKind } from '../types';

/** The only text a person may see when the AI fails. Raw provider text stays in the log. */
export const LLM_USER_ERROR = "AI hozir javob bera olmadi. Birozdan keyin qayta urinib ko'ring.";

/** Typed AI failure. `message` is safe to show to users; `detail` is the raw provider text, for logs only. */
export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    readonly detail: string,
  ) {
    super(LLM_USER_ERROR);
    this.name = 'LlmError';
  }
}

/** Worth one retry and then the cheaper fallback model. auth / limit / other never are. */
export const RETRYABLE: ReadonlySet<LlmErrorKind> = new Set<LlmErrorKind>(['timeout', 'overloaded', 'bad_output']);

// CLI/SDK error strings that arrive as the "result" text (seen live: 401 token, "Not logged in", weekly limit).
const ERROR_TEXT = /^(API Error|Failed to authenticate|Not logged in|Invalid API key|You've hit your|Claude AI usage limit|Credit balance is too low|Request timed out)/i;

export function looksLikeError(text: string): boolean {
  return ERROR_TEXT.test(text.trim());
}

const SDK_AUTH = new Set(['authentication_failed', 'oauth_org_not_allowed', 'account_on_hold', 'verification_required', 'cloud_credential_error']);

/** Maps an SDK assistant error, an HTTP status or an error text to a kind. */
export function classifyError(input: { text?: string; status?: number | null; sdkError?: string }): LlmErrorKind {
  const { status, sdkError } = input;
  const text = input.text ?? '';
  if (sdkError && SDK_AUTH.has(sdkError)) return 'auth';
  if (sdkError === 'rate_limit' || sdkError === 'billing_error') return 'limit';
  if (sdkError === 'overloaded' || sdkError === 'server_error') return 'overloaded';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'limit';
  if (status && status >= 500) return 'overloaded';
  if (/not logged in|authenticat|invalid api key|\/login|oauth|\b40[13]\b/i.test(text)) return 'auth';
  if (/limit|\b429\b|credit balance|out of credits/i.test(text)) return 'limit';
  if (/timed out|timeout/i.test(text)) return 'timeout';
  if (/overload|\b529\b|\b50[0234]\b/i.test(text)) return 'overloaded';
  return 'other';
}
