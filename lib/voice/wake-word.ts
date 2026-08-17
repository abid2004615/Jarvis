/**
 * JARVIS Voice — Wake Word Detection
 *
 * Normalizes transcript text and matches against "Hey JARVIS" patterns.
 * Conservative matching to avoid false positives.
 */

const WAKE_PATTERNS = [
  /^\s*hey\s+jarvis\b/i,
  /^\s*hi\s+jarvis\b/i,
  /^\s*ok\s+jarvis\b/i,
];

export function detectWakeWord(transcript: string): boolean {
  if (!transcript || typeof transcript !== "string") return false;
  const normalized = transcript.trim().toLowerCase().replace(/[,!?.'"-]/g, "");
  return WAKE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function stripWakeWord(transcript: string): string {
  if (!transcript) return "";
  const stripped = transcript
    .trim()
    .replace(/^(hey|hi|ok)\s+jarvis\s*[,.]?\s*/i, "");
  return stripped.trim();
}
