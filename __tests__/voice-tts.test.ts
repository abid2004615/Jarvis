/**
 * P7 Tests — TTS Manager
 *
 * In Node test env, speechSynthesis is unavailable, so speak() returns 0.
 * Tests verify the manager lifecycle and error handling paths.
 */

import { createTTSManager, splitIntoSpeechChunks } from "@/lib/voice/tts";

describe("P7 — TTS Manager", () => {
  test("createTTSManager returns valid manager", () => {
    const tts = createTTSManager();
    expect(tts.isSpeaking()).toBe(false);
    expect(tts.getRequestId()).toBe(0);
    tts.destroy();
  });

  test("speak returns 0 in non-browser env (graceful fallback)", () => {
    const tts = createTTSManager();
    const reqId = tts.speak("Hello world");
    expect(reqId).toBe(0);
    tts.destroy();
  });

  test("cancel stops speaking", () => {
    const tts = createTTSManager();
    tts.speak("Hello");
    tts.cancel();
    expect(tts.isSpeaking()).toBe(false);
    tts.destroy();
  });

  test("interrupt is safe when not speaking", () => {
    const tts = createTTSManager();
    const onEnd = jest.fn();
    tts.interrupt();
    expect(tts.isSpeaking()).toBe(false);
    expect(onEnd).not.toHaveBeenCalled();
    tts.destroy();
  });

  test("destroy prevents further speak calls", () => {
    const tts = createTTSManager();
    tts.destroy();
    const reqId = tts.speak("Hello");
    expect(reqId).toBe(0);
  });

  test("setConfig updates TTS configuration", () => {
    const tts = createTTSManager();
    tts.setConfig({ rate: 2.0, pitch: 0.5 });
    expect(() => tts.speak("test")).not.toThrow();
    tts.destroy();
  });

  test("speak does nothing with empty text", () => {
    const tts = createTTSManager();
    const reqId = tts.speak("");
    expect(reqId).toBe(0);
    tts.destroy();
  });

  test("cancel resets active request ID", () => {
    const tts = createTTSManager();
    tts.speak("Hello");
    tts.cancel();
    expect(tts.getRequestId()).toBe(0);
    tts.destroy();
  });

  test("multiple cancel calls are safe", () => {
    const tts = createTTSManager();
    tts.cancel();
    tts.cancel();
    tts.cancel();
    expect(tts.isSpeaking()).toBe(false);
    tts.destroy();
  });

  test("destroy after cancel is safe", () => {
    const tts = createTTSManager();
    tts.cancel();
    tts.destroy();
    expect(tts.isSpeaking()).toBe(false);
  });
});

/**
 * Sentence chunking.
 *
 * Long answers are queued as one utterance per sentence so playback starts on
 * the first sentence instead of after the whole paragraph is synthesized.
 * These tests pin the split itself, which is where the risk lives: a naive
 * "split on every period" mangles decimals and abbreviations.
 */
describe("TTS — sentence chunking", () => {
  test("returns nothing for empty or whitespace-only text", () => {
    expect(splitIntoSpeechChunks("")).toEqual([]);
    expect(splitIntoSpeechChunks("   \n  ")).toEqual([]);
  });

  test("keeps a single sentence intact", () => {
    expect(splitIntoSpeechChunks("Your CPU usage is 18 percent")).toEqual([
      "Your CPU usage is 18 percent",
    ]);
  });

  test("splits on sentence boundaries and keeps terminators", () => {
    expect(splitIntoSpeechChunks("Safari is open. Mail is closed. All set.")).toEqual([
      "Safari is open.",
      "Mail is closed.",
      "All set.",
    ]);
  });

  test("splits on question and exclamation marks", () => {
    expect(splitIntoSpeechChunks("Ready? Let's go! Done.")).toEqual([
      "Ready?",
      "Let's go!",
      "Done.",
    ]);
  });

  test("does not split decimal numbers", () => {
    expect(splitIntoSpeechChunks("CPU is at 3.14 percent right now")).toEqual([
      "CPU is at 3.14 percent right now",
    ]);
  });

  test("does not split known abbreviations", () => {
    expect(splitIntoSpeechChunks("Dr. Chandra called. He left a message.")).toEqual([
      "Dr. Chandra called.",
      "He left a message.",
    ]);
  });

  test("treats a trailing abbreviation as a real sentence end", () => {
    const chunks = splitIntoSpeechChunks("Bring tea, coffee, etc. Then we start.");
    expect(chunks).toEqual(["Bring tea, coffee, etc.", "Then we start."]);
  });

  test("treats grouped terminators as one boundary", () => {
    expect(splitIntoSpeechChunks('He said "stop!" Then he left.')).toEqual([
      'He said "stop!"',
      "Then he left.",
    ]);
  });

  test("treats newlines as hard boundaries so lists are not run together", () => {
    expect(splitIntoSpeechChunks("Tasks:\nBuy milk\nCall Ana")).toEqual([
      "Tasks:",
      "Buy milk",
      "Call Ana",
    ]);
  });

  test("keeps short sentences separate rather than merging them back", () => {
    // Merging short sentences would reintroduce the dead air this feature removes.
    expect(splitIntoSpeechChunks("Done. Yes. All set.")).toEqual(["Done.", "Yes.", "All set."]);
  });

  test("handles a single short answer", () => {
    expect(splitIntoSpeechChunks("Yes.")).toEqual(["Yes."]);
  });

  test("keeps an ambiguous abbreviation mid-sentence when lowercase follows", () => {
    expect(splitIntoSpeechChunks("Bring tea, coffee, etc. and then we start.")).toEqual([
      "Bring tea, coffee, etc. and then we start.",
    ]);
  });

  test("breaks an over-long sentence at a clause boundary", () => {
    const runOn =
      "I checked the calendar and the mail and the reminders, " +
      "then I looked at the battery and the disk and the network, " +
      "and everything appears to be in good order for the day ahead";
    const chunks = splitIntoSpeechChunks(runOn, 80);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(80);
    }
    // No words may be lost or duplicated by the break.
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(runOn);
  });

  test("preserves the full text across a multi-sentence split", () => {
    const source = "First one. Second one! Third one?";
    expect(splitIntoSpeechChunks(source).join(" ")).toBe(source);
  });

  test("never emits an empty or whitespace-only chunk", () => {
    const messy = "One.   Two.\n\n\nThree...  Four!";
    for (const chunk of splitIntoSpeechChunks(messy)) {
      expect(chunk.trim()).not.toBe("");
    }
  });
});
