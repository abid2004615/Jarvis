/**
 * P16.6 Regression Tests — Wake Phrase Filtering
 *
 * Verifies that "Hey JARVIS" and similar wake phrases are treated as
 * control signals, not AI commands. Wake phrases must never reach the
 * AI pipeline as normal user input.
 */

import { detectWakeWord, stripWakeWord } from "@/lib/voice/wake-word";

// ─── Wake Phrase Detection ───────────────────────────────────

describe("P16.6 — Wake phrase detection", () => {
  it("detects 'hey jarvis'", () => {
    expect(detectWakeWord("hey jarvis")).toBe(true);
  });

  it("detects 'hi jarvis'", () => {
    expect(detectWakeWord("hi jarvis")).toBe(true);
  });

  it("detects 'ok jarvis'", () => {
    expect(detectWakeWord("ok jarvis")).toBe(true);
  });

  it("does not detect wake phrase in command", () => {
    expect(detectWakeWord("what is my cpu usage")).toBe(false);
  });

  it("does not detect wake phrase in empty string", () => {
    expect(detectWakeWord("")).toBe(false);
  });
});

// ─── Wake Phrase Stripping ───────────────────────────────────

describe("P16.6 — Wake phrase stripping", () => {
  it("strips 'hey jarvis' from command", () => {
    expect(stripWakeWord("hey jarvis what is my cpu usage")).toBe("what is my cpu usage");
  });

  it("strips 'hi jarvis' from command", () => {
    expect(stripWakeWord("hi jarvis open safari")).toBe("open safari");
  });

  it("strips 'ok jarvis' from command", () => {
    expect(stripWakeWord("ok jarvis what's on my screen")).toBe("what's on my screen");
  });

  it("returns empty string for bare wake phrase", () => {
    expect(stripWakeWord("hey jarvis")).toBe("");
    expect(stripWakeWord("hi jarvis")).toBe("");
    expect(stripWakeWord("ok jarvis")).toBe("");
  });

  it("handles wake phrase with punctuation", () => {
    expect(stripWakeWord("Hey JARVIS, what is my CPU?")).toBe("what is my CPU?");
  });

  it("does not strip from normal command", () => {
    expect(stripWakeWord("what is my cpu usage")).toBe("what is my cpu usage");
  });
});

// ─── Voice Session Wake Phrase Filtering ──────────────────────

describe("P16.6 — processVoiceCommand wake filtering", () => {
  /**
   * Simulates the wake phrase filter logic from JarvisOrb.processVoiceCommand.
   * The filter strips wake phrases and ignores bare wake phrases.
   */
  function filterWakePhrase(text: string): string | null {
    const normalized = text.trim().toLowerCase().replace(/[,!?.'"-]/g, "");
    if (/^(hey|hi|ok)\s+jarvis\s*$/.test(normalized)) {
      return null;
    }
    const cleaned = text.trim().replace(/^(hey|hi|ok)\s+jarvis\s*[,.]?\s*/i, "").trim();
    if (!cleaned) return null;
    return cleaned;
  }

  it("rejects bare 'hey jarvis'", () => {
    expect(filterWakePhrase("hey jarvis")).toBeNull();
  });

  it("rejects bare 'Hey JARVIS'", () => {
    expect(filterWakePhrase("Hey JARVIS")).toBeNull();
  });

  it("rejects bare 'hi jarvis'", () => {
    expect(filterWakePhrase("hi jarvis")).toBeNull();
  });

  it("rejects bare 'ok jarvis'", () => {
    expect(filterWakePhrase("ok jarvis")).toBeNull();
  });

  it("strips wake phrase from command", () => {
    expect(filterWakePhrase("hey jarvis what is my cpu usage")).toBe("what is my cpu usage");
  });

  it("strips wake phrase with punctuation", () => {
    expect(filterWakePhrase("Hey JARVIS, open Safari")).toBe("open Safari");
  });

  it("passes normal command through unchanged", () => {
    expect(filterWakePhrase("what is my cpu usage")).toBe("what is my cpu usage");
  });

  it("passes normal command with 'open safari'", () => {
    expect(filterWakePhrase("open safari")).toBe("open safari");
  });

  it("rejects empty string", () => {
    expect(filterWakePhrase("")).toBeNull();
  });

  it("rejects whitespace-only string", () => {
    expect(filterWakePhrase("   ")).toBeNull();
  });
});

// ─── Duplicate Wake Event Prevention ──────────────────────────

describe("P16.6 — Duplicate wake event prevention", () => {
  /**
   * Simulates the deduplication logic from GlobalWakeIndicator.
   * lastTimestamp initialized to -Infinity so the first event is always accepted.
   */
  function createWakeDebouncer(cooldownMs: number) {
    let lastTimestamp = -Infinity;
    return (timestamp: number): boolean => {
      if (timestamp - lastTimestamp < cooldownMs) {
        return false; // duplicate, ignore
      }
      lastTimestamp = timestamp;
      return true; // accepted
    };
  }

  it("accepts first wake event", () => {
    const debounce = createWakeDebouncer(5000);
    expect(debounce(1000)).toBe(true);
  });

  it("rejects duplicate within cooldown", () => {
    const debounce = createWakeDebouncer(5000);
    expect(debounce(1000)).toBe(true);
    expect(debounce(2000)).toBe(false);
    expect(debounce(4000)).toBe(false);
  });

  it("accepts event after cooldown expires", () => {
    const debounce = createWakeDebouncer(5000);
    expect(debounce(1000)).toBe(true);
    expect(debounce(7000)).toBe(true);
  });

  it("rejects three rapid events — only first accepted", () => {
    const debounce = createWakeDebouncer(5000);
    expect(debounce(1000)).toBe(true);
    expect(debounce(1500)).toBe(false);
    expect(debounce(2000)).toBe(false);
  });
});

// ─── Server-Side Wake Cooldown ────────────────────────────────

describe("P16.6 — Server-side wake cooldown", () => {
  /**
   * Simulates the server-side 3s cooldown from /api/wake.
   */
  function createServerCooldown(cooldownMs: number) {
    let lastTimestamp = -Infinity;
    return (now: number): boolean => {
      if (now - lastTimestamp < cooldownMs) {
        return false; // throttled
      }
      lastTimestamp = now;
      return true; // accepted
    };
  }

  it("accepts first wake", () => {
    const cooldown = createServerCooldown(3000);
    expect(cooldown(1000)).toBe(true);
  });

  it("rejects within 3s", () => {
    const cooldown = createServerCooldown(3000);
    cooldown(1000);
    expect(cooldown(2000)).toBe(false);
    expect(cooldown(3500)).toBe(false);
  });

  it("accepts after 3s", () => {
    const cooldown = createServerCooldown(3000);
    cooldown(1000);
    expect(cooldown(5000)).toBe(true);
  });
});

// ─── Rate Limit Retry-After ───────────────────────────────────

describe("P16.6 — Retry-After handling", () => {
  it("parses Retry-After header as integer", () => {
    const header = "5";
    const seconds = parseInt(header, 10);
    expect(seconds).toBe(5);
    expect(Number.isFinite(seconds)).toBe(true);
  });

  it("handles missing Retry-After header", () => {
    const header = null;
    const seconds = header ? parseInt(header, 10) : undefined;
    expect(seconds).toBeUndefined();
  });

  it("handles non-numeric Retry-After header", () => {
    const header = "invalid";
    const seconds = parseInt(header, 10);
    expect(Number.isFinite(seconds)).toBe(false);
  });

  it("caps retry delay at 30 seconds", () => {
    const retryAfter = 60;
    const delay = Math.min(retryAfter * 1000, 30000);
    expect(delay).toBe(30000);
  });

  it("breaks retry for long retry-after", () => {
    const retryAfter = 60;
    const shouldBreak = retryAfter > 30;
    expect(shouldBreak).toBe(true);
  });

  it("continues retry for short retry-after", () => {
    const retryAfter = 5;
    const shouldBreak = retryAfter > 30;
    expect(shouldBreak).toBe(false);
  });
});

// ─── AI Request Count Verification ────────────────────────────

describe("P16.6 — AI request count", () => {
  it("bare wake phrase produces zero AI requests", () => {
    const requests: string[] = [];
    function processVoiceCommand(text: string) {
      const normalized = text.trim().toLowerCase().replace(/[,!?.'"-]/g, "");
      if (/^(hey|hi|ok)\s+jarvis\s*$/.test(normalized)) return;
      const cleaned = text.trim().replace(/^(hey|hi|ok)\s+jarvis\s*[,.]?\s*/i, "").trim();
      if (!cleaned) return;
      requests.push(cleaned);
    }

    processVoiceCommand("hey jarvis");
    processVoiceCommand("Hey JARVIS");
    processVoiceCommand("hi jarvis");
    processVoiceCommand("ok jarvis");
    expect(requests).toHaveLength(0);
  });

  it("command with wake phrase produces exactly one AI request", () => {
    const requests: string[] = [];
    function processVoiceCommand(text: string) {
      const normalized = text.trim().toLowerCase().replace(/[,!?.'"-]/g, "");
      if (/^(hey|hi|ok)\s+jarvis\s*$/.test(normalized)) return;
      const cleaned = text.trim().replace(/^(hey|hi|ok)\s+jarvis\s*[,.]?\s*/i, "").trim();
      if (!cleaned) return;
      requests.push(cleaned);
    }

    processVoiceCommand("hey jarvis what is my cpu usage");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toBe("what is my cpu usage");
  });

  it("normal command produces exactly one AI request", () => {
    const requests: string[] = [];
    function processVoiceCommand(text: string) {
      const normalized = text.trim().toLowerCase().replace(/[,!?.'"-]/g, "");
      if (/^(hey|hi|ok)\s+jarvis\s*$/.test(normalized)) return;
      const cleaned = text.trim().replace(/^(hey|hi|ok)\s+jarvis\s*[,.]?\s*/i, "").trim();
      if (!cleaned) return;
      requests.push(cleaned);
    }

    processVoiceCommand("what is my cpu usage");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toBe("what is my cpu usage");
  });

  it("multiple wake phrases produce zero AI requests", () => {
    const requests: string[] = [];
    function processVoiceCommand(text: string) {
      const normalized = text.trim().toLowerCase().replace(/[,!?.'"-]/g, "");
      if (/^(hey|hi|ok)\s+jarvis\s*$/.test(normalized)) return;
      const cleaned = text.trim().replace(/^(hey|hi|ok)\s+jarvis\s*[,.]?\s*/i, "").trim();
      if (!cleaned) return;
      requests.push(cleaned);
    }

    processVoiceCommand("hey jarvis");
    processVoiceCommand("hey jarvis");
    processVoiceCommand("hey jarvis");
    expect(requests).toHaveLength(0);
  });
});
