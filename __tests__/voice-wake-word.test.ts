/**
 * P7 Tests — Wake Word Detection
 */

import { detectWakeWord, stripWakeWord } from "@/lib/voice/wake-word";

describe("P7 — Wake Word Detection", () => {
  describe("detectWakeWord", () => {
    test("detects 'Hey JARVIS' in various forms", () => {
      expect(detectWakeWord("Hey JARVIS")).toBe(true);
      expect(detectWakeWord("hey jarvis")).toBe(true);
      expect(detectWakeWord("HEY JARVIS")).toBe(true);
      expect(detectWakeWord("Hey Jarvis, what time is it")).toBe(true);
      expect(detectWakeWord("hey jarvis, can you help me")).toBe(true);
    });

    test("detects 'Hi JARVIS'", () => {
      expect(detectWakeWord("Hi JARVIS")).toBe(true);
      expect(detectWakeWord("hi jarvis")).toBe(true);
    });

    test("detects 'OK JARVIS'", () => {
      expect(detectWakeWord("OK JARVIS")).toBe(true);
      expect(detectWakeWord("ok jarvis")).toBe(true);
    });

    test("rejects non-wake-word input", () => {
      expect(detectWakeWord("what time is it")).toBe(false);
      expect(detectWakeWord("jarvis please help")).toBe(false);
      expect(detectWakeWord("hey there")).toBe(false);
      expect(detectWakeWord("heyjarvis")).toBe(false);
      expect(detectWakeWord("")).toBe(false);
    });

    test("handles edge cases", () => {
      expect(detectWakeWord(null as unknown as string)).toBe(false);
      expect(detectWakeWord(undefined as unknown as string)).toBe(false);
      expect(detectWakeWord("  Hey JARVIS  ")).toBe(true);
      expect(detectWakeWord("Hey JARVIS,")).toBe(true);
    });
  });

  describe("stripWakeWord", () => {
    test("removes 'Hey JARVIS' prefix", () => {
      expect(stripWakeWord("Hey JARVIS, what time is it")).toBe("what time is it");
      expect(stripWakeWord("hey jarvis can you help")).toBe("can you help");
    });

    test("removes 'Hi JARVIS' prefix", () => {
      expect(stripWakeWord("Hi JARVIS, open the browser")).toBe("open the browser");
    });

    test("removes 'OK JARVIS' prefix", () => {
      expect(stripWakeWord("OK JARVIS, tell me a joke")).toBe("tell me a joke");
    });

    test("returns empty string when only wake word present", () => {
      expect(stripWakeWord("Hey JARVIS")).toBe("");
      expect(stripWakeWord("Hey JARVIS,")).toBe("");
    });

    test("returns original text when no wake word present", () => {
      expect(stripWakeWord("what time is it")).toBe("what time is it");
      expect(stripWakeWord("")).toBe("");
    });
  });
});
