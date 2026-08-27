/**
 * P7 Tests — Voice Session State Machine
 */

import { createVoiceSession } from "@/lib/voice/session";

describe("P7 — Voice Session", () => {
  test("createVoiceSession returns valid session", () => {
    const session = createVoiceSession();
    expect(session.getState()).toBe("idle");
    session.destroy();
  });

  test("getSettings returns default settings", () => {
    const session = createVoiceSession();
    const settings = session.getSettings();
    expect(settings.wakeWordEnabled).toBe(false);
    expect(settings.followUpWindow).toBe(15);
    expect(settings.voiceResponseEnabled).toBe(true);
    session.destroy();
  });

  test("updateSettings persists changes", () => {
    const session = createVoiceSession();
    session.updateSettings({ wakeWordEnabled: true, followUpWindow: 30 });
    const settings = session.getSettings();
    expect(settings.wakeWordEnabled).toBe(true);
    expect(settings.followUpWindow).toBe(30);
    session.destroy();
  });

  test("getState returns current state", () => {
    const session = createVoiceSession();
    expect(session.getState()).toBe("idle");
    session.destroy();
  });

  test("getPermissionState returns unknown initially", () => {
    const session = createVoiceSession();
    expect(session.getPermissionState()).toBe("unknown");
    session.destroy();
  });

  test("destroy cleans up session", () => {
    const session = createVoiceSession();
    session.destroy();
    expect(session.getState()).toBe("idle");
  });

  test("stop after destroy is safe", () => {
    const session = createVoiceSession();
    session.destroy();
    expect(() => session.stop()).not.toThrow();
  });

  test("onStateChange callback fires on destroy", () => {
    const onStateChange = jest.fn();
    const session = createVoiceSession({ onStateChange });
    session.destroy();
    expect(onStateChange).toHaveBeenCalledWith("idle");
  });

  test("handlePipelineResponse speaks the message", () => {
    const onSpeakingStart = jest.fn();
    const session = createVoiceSession({ onSpeakingStart });
    session.handlePipelineResponse({ message: "Hello world" });
    expect(onSpeakingStart).toHaveBeenCalled();
    session.destroy();
  });

  test("speakText does not change voice recognition state", () => {
    const onStateChange = jest.fn();
    const session = createVoiceSession({ onStateChange });

    session.speakText("Typed response");

    expect(session.getState()).toBe("idle");
    expect(onStateChange).not.toHaveBeenCalled();
    session.destroy();
  });

  test("handlePipelineResponse shows confirmation when pending", () => {
    const onConfirmationRequest = jest.fn();
    const session = createVoiceSession({ onConfirmationRequest });
    session.handlePipelineResponse({
      message: "Please confirm",
      pendingConfirmation: { toolId: "test-123", description: "Open application" },
    });
    expect(onConfirmationRequest).toHaveBeenCalledWith("test-123", "Open application");
    expect(session.getState()).toBe("waiting_for_confirmation");
    session.destroy();
  });

  test("handleConfirmation transitions to thinking", () => {
    const onConfirmationResult = jest.fn();
    const session = createVoiceSession({ onConfirmationResult });
    session.handlePipelineResponse({
      message: "Confirm?",
      pendingConfirmation: { toolId: "tool-1", description: "Do something" },
    });
    expect(session.getState()).toBe("waiting_for_confirmation");
    session.handleConfirmation("tool-1", true);
    expect(session.getState()).toBe("thinking");
    expect(onConfirmationResult).toHaveBeenCalledWith("tool-1", true);
    session.destroy();
  });

  test("handleConfirmation does nothing if not in waiting state", () => {
    const onConfirmationResult = jest.fn();
    const session = createVoiceSession({ onConfirmationResult });
    session.handleConfirmation("tool-1", true);
    expect(onConfirmationResult).not.toHaveBeenCalled();
    expect(session.getState()).toBe("idle");
    session.destroy();
  });

  test("processCommand triggers thinking state", () => {
    const onStateChange = jest.fn();
    const session = createVoiceSession({ onStateChange });
    session.processCommand("hello");
    expect(onStateChange).toHaveBeenCalledWith("thinking");
    session.destroy();
  });

  test("pushToTalkStart resolves gracefully without browser API", async () => {
    const onError = jest.fn();
    const session = createVoiceSession({ onError });
    await session.pushToTalkStart();
    expect(onError).toHaveBeenCalled();
    session.destroy();
  });

  test("start fails gracefully without browser APIs", async () => {
    const onError = jest.fn();
    const session = createVoiceSession({ onError });
    await session.start();
    expect(onError).toHaveBeenCalled();
    session.destroy();
  });
});
