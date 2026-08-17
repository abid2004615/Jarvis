/**
 * P7 Tests — Voice Settings Persistence
 *
 * Tests the pure logic of settings load/save/reset.
 * In Node test env, localStorage is unavailable, so isBrowser() returns false
 * and all operations gracefully return defaults. Tests verify the fallback path.
 */

import { loadVoiceSettings, saveVoiceSettings, resetVoiceSettings } from "@/lib/voice/settings";

describe("P7 — Voice Settings", () => {
  test("loadVoiceSettings returns defaults when not in browser", () => {
    const settings = loadVoiceSettings();
    expect(settings.wakeWordEnabled).toBe(false);
    expect(settings.followUpWindow).toBe(15);
    expect(settings.voiceResponseEnabled).toBe(true);
    expect(settings.pushToTalkEnabled).toBe(true);
  });

  test("saveVoiceSettings does not throw outside browser", () => {
    expect(() => {
      saveVoiceSettings({
        wakeWordEnabled: true,
        followUpWindow: 30,
        voiceResponseEnabled: false,
        pushToTalkEnabled: false,
      });
    }).not.toThrow();
  });

  test("resetVoiceSettings does not throw outside browser", () => {
    expect(() => resetVoiceSettings()).not.toThrow();
  });

  test("loadVoiceSettings always returns defaults in Node env", () => {
    saveVoiceSettings({
      wakeWordEnabled: true,
      followUpWindow: 30,
      voiceResponseEnabled: false,
      pushToTalkEnabled: false,
    });
    const settings = loadVoiceSettings();
    expect(settings.wakeWordEnabled).toBe(false);
    expect(settings.followUpWindow).toBe(15);
  });

  test("default settings object has correct shape", () => {
    const settings = loadVoiceSettings();
    expect(typeof settings.wakeWordEnabled).toBe("boolean");
    expect(typeof settings.followUpWindow).toBe("number");
    expect(typeof settings.voiceResponseEnabled).toBe("boolean");
    expect(typeof settings.pushToTalkEnabled).toBe("boolean");
  });
});
