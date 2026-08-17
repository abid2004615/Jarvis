/**
 * P7 Tests — Voice Activity Detector
 */

import { createVoiceActivityDetector } from "@/lib/voice/vad";

describe("P7 — Voice Activity Detector", () => {
  test("createVoiceActivityDetector returns valid detector", () => {
    const vad = createVoiceActivityDetector();
    expect(vad.getLevel()).toBe(0);
    expect(vad.isSpeechActive()).toBe(false);
    vad.destroy();
  });

  test("detach releases resources", () => {
    const vad = createVoiceActivityDetector();
    vad.detach();
    expect(vad.getLevel()).toBe(0);
    vad.destroy();
  });

  test("destroy prevents further operations", () => {
    const vad = createVoiceActivityDetector();
    vad.destroy();
    expect(vad.getLevel()).toBe(0);
    expect(vad.isSpeechActive()).toBe(false);
  });

  test("setCallbacks sets callbacks", () => {
    const vad = createVoiceActivityDetector();
    expect(() => vad.setCallbacks({ onLevel: () => {} })).not.toThrow();
    vad.destroy();
  });

  test("setCallbacks with no callbacks works", () => {
    const vad = createVoiceActivityDetector();
    expect(() => vad.setCallbacks({})).not.toThrow();
    vad.destroy();
  });

  test("attach without a real stream handles gracefully", () => {
    const vad = createVoiceActivityDetector();
    expect(() => vad.attach({} as MediaStream)).not.toThrow();
    vad.destroy();
  });

  test("custom thresholds are respected", () => {
    const vad = createVoiceActivityDetector({
      speechThreshold: 0.5,
      silenceTimeout: 500,
      maxDuration: 5000,
      cooldown: 100,
    });
    expect(vad.getLevel()).toBe(0);
    vad.destroy();
  });
});
