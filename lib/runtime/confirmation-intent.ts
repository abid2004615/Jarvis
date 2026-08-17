/**
 * Natural-language confirmation intent detection.
 * Used by the pipeline to let users approve/deny a pending tool confirmation
 * by speaking or typing ("yes", "do it", "no", "actually don't", ...).
 *
 * The server still decides whether the pending confirmation is valid; the
 * client never decides permissions. Denying is always safe (no side effect);
 * approving only resolves an existing, unexpired pending confirmation that
 * belongs to the same conversation.
 */

export type ConfirmationIntent = "approve" | "deny" | null;

const APPROVE_PHRASES = new Set([
  "yes",
  "yeah",
  "yep",
  "sure",
  "ok",
  "okay",
  "allow",
  "confirm",
  "do it",
  "do it now",
  "yes do it",
  "go ahead",
  "open it",
  "yes please",
  "please do",
  "sure do it",
  "yep do it",
]);

const DENY_PHRASES = new Set([
  "no",
  "nope",
  "cancel",
  "skip",
  "stop",
  "abort",
  "dismiss",
  "forget it",
  "leave it",
  "never mind",
  "nevermind",
  "not now",
  "no thanks",
  "no thanks",
  "don't",
  "dont",
  "don't do it",
  "dont do it",
  "don't do that",
  "dont do that",
  "actually don't",
  "actually dont",
  "no don't",
  "no dont",
]);

const APPROVE_STARTS = /^(yes|yeah|yep|sure|ok|okay|allow|confirm|please do|do it|go ahead|open it)\b/;
const DENY_STARTS = /^(no|cancel|skip|stop|abort|dismiss|don'?t|dont|never mind|nevermind|actually don'?t|actually dont)\b/;

/**
 * Classify a short user utterance as approve/deny of a pending confirmation.
 * Only returns a decision for clear, short phrases; everything else is null
 * so normal conversation continues through the AI.
 */
export function classifyConfirmationIntent(input: string): ConfirmationIntent {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return null;

  if (DENY_PHRASES.has(text)) return "deny";
  if (APPROVE_PHRASES.has(text)) return "approve";

  const words = text.split(" ").length;
  if (words > 4) return null;

  if (DENY_STARTS.test(text)) return "deny";
  if (APPROVE_STARTS.test(text)) return "approve";

  return null;
}
