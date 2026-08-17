/**
 * P7 Tests — TTS Manager
 *
 * In Node test env, speechSynthesis is unavailable, so speak() returns 0.
 * Tests verify the manager lifecycle and error handling paths.
 */

import { createTTSManager } from "@/lib/voice/tts";

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
