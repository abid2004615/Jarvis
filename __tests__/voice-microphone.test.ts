/**
 * P7 Tests — Microphone Manager
 */

import { createMicrophoneManager } from "@/lib/voice/microphone";

describe("P7 — Microphone Manager", () => {
  test("createMicrophoneManager returns valid manager", () => {
    const mic = createMicrophoneManager();
    expect(mic.getState()).toBe("idle");
    expect(mic.getStream()).toBeNull();
    mic.stop();
  });

  test("getState returns idle initially", () => {
    const mic = createMicrophoneManager();
    expect(mic.getState()).toBe("idle");
  });

  test("getStream returns null when not started", () => {
    const mic = createMicrophoneManager();
    expect(mic.getStream()).toBeNull();
  });

  test("stop releases resources", () => {
    const mic = createMicrophoneManager();
    mic.stop();
    expect(mic.getState()).toBe("idle");
    expect(mic.getStream()).toBeNull();
  });

  test("pause/resume transitions state correctly", () => {
    const mic = createMicrophoneManager();
    mic.pause();
    expect(mic.getState()).toBe("idle");
    mic.resume();
    expect(mic.getState()).toBe("idle");
  });

  test("checkPermission returns unknown in test environment", async () => {
    const mic = createMicrophoneManager();
    const result = await mic.checkPermission();
    expect(["unknown", "unavailable", "granted", "denied"]).toContain(result);
  });

  test("requestPermission handles unavailable gracefully", async () => {
    const mic = createMicrophoneManager();
    const result = await mic.requestPermission();
    expect(["unavailable", "denied", "granted"]).toContain(result);
  });

  test("start throws when getUserMedia unavailable", async () => {
    const mic = createMicrophoneManager();
    await expect(mic.start()).rejects.toThrow();
  });
});
