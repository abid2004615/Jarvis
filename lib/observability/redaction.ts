/**
 * P14 — Redaction Engine
 *
 * Centralized secret redaction. Runs BEFORE logging, persistence, and error reporting.
 * Ensures secrets never appear in logs even if an exception contains them.
 */

interface RedactionResult {
  redacted: string;
  redactionsFound: number;
  patterns: string[];
}

const REDACTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Groq API keys
  { pattern: /gsk_[A-Za-z0-9_-]{10,}/g, label: "REDACTED_API_KEY" },
  // OpenAI API keys (sk-proj-*, sk-*)
  { pattern: /sk-proj-[A-Za-z0-9_-]{20,}/g, label: "REDACTED_API_KEY" },
  { pattern: /sk-[A-Za-z0-9]{20,}/g, label: "REDACTED_API_KEY" },
  // Anthropic API keys
  { pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g, label: "REDACTED_API_KEY" },
  // xAI API keys
  { pattern: /xai-[A-Za-z0-9_-]{20,}/g, label: "REDACTED_API_KEY" },
  // AWS access keys
  { pattern: /AKIA[A-Z0-9]{16}/g, label: "REDACTED_AWS_KEY" },
  // Bearer tokens
  { pattern: /Bearer\s+[A-Za-z0-9._-]{20,}/gi, label: "REDACTED_BEARER_TOKEN" },
  // JWTs
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: "REDACTED_JWT" },
  // Generic API key patterns
  { pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9._-]{16,}["']?/gi, label: "REDACTED_API_KEY" },
  // Password patterns
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{4,}["']?/gi, label: "REDACTED_PASSWORD" },
  // Authorization headers
  { pattern: /Authorization\s*[:=]\s*["']?[^\s"']{10,}["']?/gi, label: "REDACTED_AUTH_HEADER" },
  // Private keys (PEM)
  { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, label: "REDACTED_PRIVATE_KEY" },
  // Slack tokens
  { pattern: /xox[bpsar]-[A-Za-z0-9-]{10,}/g, label: "REDACTED_SLACK_TOKEN" },
  // GitHub tokens
  { pattern: /gh[pousr]_[A-Za-z0-9_]{30,}/g, label: "REDACTED_GITHUB_TOKEN" },
  // Google API keys
  { pattern: /AIza[A-Za-z0-9_-]{30,}/g, label: "REDACTED_GOOGLE_KEY" },
  // Stripe keys
  { pattern: /[sr]k_(?:live|test)_[A-Za-z0-9]{10,}/g, label: "REDACTED_STRIPE_KEY" },
  // Generic secret values in key=value patterns
  { pattern: /(?:secret|token|credential|auth)\s*[:=]\s*["']?[A-Za-z0-9._/-]{10,}["']?/gi, label: "REDACTED_SECRET" },
];

/**
 * Redact all secrets from a string.
 * Returns the redacted string and metadata about what was found.
 */
export function redactSecrets(input: string): RedactionResult {
  if (!input || typeof input !== "string") {
    return { redacted: input ?? "", redactionsFound: 0, patterns: [] };
  }

  let redacted = input;
  let redactionsFound = 0;
  const patterns: string[] = [];

  for (const { pattern, label } of REDACTION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = redacted.match(regex);
    if (matches && matches.length > 0) {
      redactionsFound += matches.length;
      patterns.push(label);
      redacted = redacted.replace(regex, `[${label}]`);
    }
  }

  return { redacted, redactionsFound, patterns: [...new Set(patterns)] };
}

/**
 * Redact secrets from a structured object.
 * Recursively walks the object and redacts string values.
 */
export function redactObject<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === "string") {
    return redactSecrets(input).redacted as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactObject(item)) as T;
  }

  if (typeof input === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      result[key] = redactObject(value);
    }
    return result as T;
  }

  return input;
}

/**
 * Redact error messages specifically.
 * Ensures error messages never contain secrets, even if the original error did.
 */
export function redactErrorMessage(error: unknown): string {
  let message: string;

  if (error instanceof Error) {
    message = error.message || error.name || "Unknown error";
  } else if (typeof error === "string") {
    message = error;
  } else {
    message = "Unknown error";
  }

  const { redacted } = redactSecrets(message);
  return redacted.length > 500 ? redacted.substring(0, 500) : redacted;
}

/**
 * Check if a string contains any detectable secrets.
 */
export function containsSecrets(input: string): boolean {
  if (!input || typeof input !== "string") {
    return false;
  }

  for (const { pattern } of REDACTION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    if (regex.test(input)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the list of redaction pattern labels (for diagnostics).
 */
export function getRedactionPatternLabels(): string[] {
  return [...new Set(REDACTION_PATTERNS.map((p) => p.label))];
}
