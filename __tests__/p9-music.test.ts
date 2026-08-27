/**
 * P9 Tests — Music Integration
 */

import { isMusicRunning, getMusicState, controlMusic, playTrack } from "@/lib/macos/music";

describe("P9 — Music Integration", () => {
  test("isMusicRunning returns boolean", () => {
    const result = isMusicRunning();
    expect(typeof result).toBe("boolean");
  });

  test("getMusicState returns structured result", () => {
    const result = getMusicState();
    expect(typeof result.available).toBe("boolean");
    expect(typeof result.isRunning).toBe("boolean");
  });

  test("controlMusic returns structured result for play", () => {
    const result = controlMusic("play");
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });

  test("controlMusic returns structured result for pause", () => {
    const result = controlMusic("pause");
    expect(typeof result.success).toBe("boolean");
  });

  test("controlMusic returns structured result for next", () => {
    const result = controlMusic("next");
    expect(typeof result.success).toBe("boolean");
  });

  test("controlMusic returns structured result for previous", () => {
    const result = controlMusic("previous");
    expect(typeof result.success).toBe("boolean");
  });

  test("playTrack returns structured result", () => {
    const result = playTrack("test");
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });

  test("playTrack handles empty query", () => {
    const result = playTrack("");
    expect(result.success).toBe(false);
  });
});
