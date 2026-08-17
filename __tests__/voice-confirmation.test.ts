/**
 * P7 Tests — Voice Confirmation Flow
 */

import { createVoiceSession } from "@/lib/voice/session";

describe("P7 — Voice Confirmation", () => {
  test("confirmation flow: pending → waiting → approve → thinking", () => {
    const onConfirmationRequest = jest.fn();
    const onConfirmationResult = jest.fn();
    const session = createVoiceSession({
      onConfirmationRequest,
      onConfirmationResult,
    });

    session.handlePipelineResponse({
      message: "Confirm action",
      pendingConfirmation: { toolId: "tool-abc", description: "Launch app" },
    });

    expect(session.getState()).toBe("waiting_for_confirmation");
    expect(onConfirmationRequest).toHaveBeenCalledWith("tool-abc", "Launch app");

    session.handleConfirmation("tool-abc", true);
    expect(session.getState()).toBe("thinking");
    expect(onConfirmationResult).toHaveBeenCalledWith("tool-abc", true);

    session.destroy();
  });

  test("confirmation flow: deny", () => {
    const onConfirmationResult = jest.fn();
    const session = createVoiceSession({ onConfirmationResult });

    session.handlePipelineResponse({
      message: "Confirm?",
      pendingConfirmation: { toolId: "tool-xyz", description: "Delete file" },
    });

    session.handleConfirmation("tool-xyz", false);
    expect(onConfirmationResult).toHaveBeenCalledWith("tool-xyz", false);

    session.destroy();
  });

  test("voice command → pipeline → confirmation → voice confirm", () => {
    const onTranscript = jest.fn();
    const onConfirmationRequest = jest.fn();
    const onConfirmationResult = jest.fn();
    const session = createVoiceSession({
      onTranscript,
      onConfirmationRequest,
      onConfirmationResult,
    });

    session.processCommand("launch safari");
    expect(onTranscript).toHaveBeenCalledWith("launch safari", true);

    session.handlePipelineResponse({
      message: "Please confirm",
      pendingConfirmation: { toolId: "confirm-1", description: "Launch Safari" },
    });

    expect(session.getState()).toBe("waiting_for_confirmation");
    session.handleConfirmation("confirm-1", true);
    expect(onConfirmationResult).toHaveBeenCalledWith("confirm-1", true);

    session.destroy();
  });
});
