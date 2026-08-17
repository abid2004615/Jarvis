/**
 * JARVIS Persistent Memory — Intent Detection
 *
 * The pipeline only allows `remember_user_preference` when the user's message
 * carries an EXPLICIT memory intent. This prevents ordinary statements
 * ("I prefer dark mode", "I usually use Python") from being persisted.
 *
 * Detection is intentionally strict and conservative:
 *  - "remember how we fixed that bug" is NOT a remember intent.
 *  - "forget everything" is a clear intent, checked before forget.
 */

export type MemoryIntent = "remember" | "forget" | "clear" | "recall" | "none";

const REMEMBER_PATTERNS: RegExp[] = [
  /\bremember\s+(that|this|these|it|my|me|i|i'?m|to\s+use|always|never)\b/i,
  /\bplease\s+remember\b/i,
  /\bsave\s+(this|that|the|a)\s+(preference|preferences|fact|facts|setting|settings|detail|details)\b/i,
  /\bnote\s+(that|down)\b/i,
  /\bkeep\s+in\s+mind\s+that\b/i,
  /\bremember\s+(it\s+for\s+me|for\s+me)\b/i,
];

const FORGET_PATTERNS: RegExp[] = [
  /\bforget\s+(that|the|my|this|it|about|what\s+you\s+know)\b/i,
  /\bremove\s+(that|the|this|my)\s+(preference|memory|memories|fact|facts|setting|settings|entry|entries)\b/i,
  /\bstop\s+remembering\b/i,
];

const CLEAR_PATTERNS: RegExp[] = [
  /\bforget\s+everything\b/i,
  /\bclear\s+(all\s+)?(your\s+|my\s+)?(memory|memories|preferences)\b/i,
  /\berase\s+(all\s+)?(your\s+|my\s+)?(memory|memories|preferences)\b/i,
  /\bdelete\s+(all\s+)?(the\s+)?(your\s+|my\s+)?(memory|memories|preferences)\b/i,
  /\bwipe\s+(your\s+|my\s+)?(memory|memories|preferences)\b/i,
];

const RECALL_PATTERNS: RegExp[] = [
  /\b(what|how)\s+do\s+you\s+(remember|recall|know)\b/i,
  /\bdo\s+you\s+remember\b/i,
  /\brecall\b/i,
  /\bwhat\b[^\n?!]{0,40}?\s+(do|does)\s+(i|you)\s+(prefer|like|use)\b/i,
  /\bwhat\s+.*\b(memories?|remembered|preferences?)\b/i,
  /\bwhat\s+do\s+you\s+know\s+about\s+me\b/i,
  /\bhow\s+should\s+you\s+(answer|respond|reply|talk|speak)\b/i,
];

/**
 * Classify a message by memory intent. "clear" is checked first so that
 * "forget everything" resolves to clear rather than forget. "recall" is
 * checked before "remember" so recall questions like "do you remember my
 * response style?" resolve to recall rather than remember.
 */
export function detectMemoryIntent(input: string): MemoryIntent {
  const text = String(input ?? "").trim();
  if (!text) return "none";

  if (CLEAR_PATTERNS.some((pattern) => pattern.test(text))) return "clear";
  if (RECALL_PATTERNS.some((pattern) => pattern.test(text))) return "recall";
  if (REMEMBER_PATTERNS.some((pattern) => pattern.test(text))) return "remember";
  if (FORGET_PATTERNS.some((pattern) => pattern.test(text))) return "forget";
  return "none";
}
