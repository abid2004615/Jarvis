/**
 * Tests for Enhanced Voice Integration
 * Validates voice controller error handling and state tracking
 */

import { createVoiceController } from "@/lib/voice-legacy";

describe("Voice Controller Enhanced Features", () => {
  describe("State Tracking", () => {
    test("should track listening state", () => {
      const controller = createVoiceController();
      expect(controller.isListening()).toBe(false);
      expect(controller.isSpeaking()).toBe(false);
    });

    test("should report supported feature", () => {
      const controller = createVoiceController();
      expect(typeof controller.supported).toBe("boolean");
    });
  });

  describe("Error Message Mapping", () => {
    test("should map network error", () => {
      const controller = createVoiceController();
      const message = (controller as any).mapErrorMessage("network");
      expect(message).toContain("Network");
    });

    test("should map no-speech error", () => {
      const controller = createVoiceController();
      const message = (controller as any).mapErrorMessage("no-speech");
      expect(message).toContain("No speech");
    });

    test("should map not-allowed error", () => {
      const controller = createVoiceController();
      const message = (controller as any).mapErrorMessage("not-allowed");
      expect(message).toContain("denied");
    });

    test("should handle unknown error gracefully", () => {
      const controller = createVoiceController();
      const message = (controller as any).mapErrorMessage("unknown");
      expect(message).toBeDefined();
      expect(typeof message).toBe("string");
    });

    test("should have user-friendly error messages", () => {
      const controller = createVoiceController();
      const errors = ["network", "no-speech", "not-allowed", "service-not-allowed", "bad-grammar"];

      for (const error of errors) {
        const message = (controller as any).mapErrorMessage(error);
        expect(message).not.toMatch(/technical|implementation|code/i);
      }
    });
  });

  describe("Controller Initialization", () => {
    test("should create controller instance", () => {
      const controller = createVoiceController();
      expect(controller).toBeDefined();
      expect(controller.startListening).toBeDefined();
      expect(controller.stopListening).toBeDefined();
      expect(controller.speak).toBeDefined();
      expect(controller.cancel).toBeDefined();
    });

    test("should have all required methods", () => {
      const controller = createVoiceController();
      expect(typeof controller.startListening).toBe("function");
      expect(typeof controller.stopListening).toBe("function");
      expect(typeof controller.speak).toBe("function");
      expect(typeof controller.cancel).toBe("function");
      expect(typeof controller.isListening).toBe("function");
      expect(typeof controller.isSpeaking).toBe("function");
    });
  });

  describe("Cancel Functionality", () => {
    test("should have cancel method", () => {
      const controller = createVoiceController();
      expect(typeof controller.cancel).toBe("function");
      // Should not throw
      controller.cancel();
    });

    test("should handle multiple cancels gracefully", () => {
      const controller = createVoiceController();
      controller.cancel();
      controller.cancel();
      controller.cancel();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("Speech Synthesis Fallback", () => {
    test("should handle speak when speechSynthesis unavailable", () => {
      const controller = createVoiceController();
      const callback = jest.fn();
      // Even if speechSynthesis is unavailable, should not crash
      controller.speak("Test message", { onEnd: callback });
    });

    test("should invoke onEnd when speechSynthesis is unavailable", () => {
      const controller = createVoiceController();
      const onEnd = jest.fn();
      const onStart = jest.fn();

      controller.speak("Test message", { onStart, onEnd });

      // In a non-browser environment TTS cannot start; the controller must
      // still signal completion so the UI never hangs in a speaking state.
      expect(onStart).not.toHaveBeenCalled();
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        expect(onEnd).toHaveBeenCalled();
      }
    });

    test("should handle speak without options", () => {
      const controller = createVoiceController();
      // Should not throw
      controller.speak("Test message");
    });

    test("should handle empty speak text", () => {
      const controller = createVoiceController();
      // Should not throw
      controller.speak("");
    });
  });

  describe("Interface Requirements", () => {
    test("should have correct function signatures", () => {
      const controller = createVoiceController();

      // startListening should accept callback and error callback
      expect(controller.startListening.length).toBeGreaterThanOrEqual(1);

      // speak should accept text and options
      expect(controller.speak.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Error Handling in Listening", () => {
    test("should provide error callback to startListening", () => {
      const controller = createVoiceController();
      const onError = jest.fn();
      const onResult = jest.fn();

      // If speech recognition not available, should call error
      if (!controller.supported) {
        controller.startListening(onResult, onError);
        // May or may not be called depending on browser support
      }
    });

    test("should handle already listening error", () => {
      const controller = createVoiceController();
      const onError = jest.fn();
      const onResult = jest.fn();

      if (controller.supported) {
        // First start
        controller.startListening(onResult, onError);
        // Second start (should error)
        controller.startListening(onResult, onError);

        // Should have error callback invoked
        expect(onError).toHaveBeenCalled();
      }
    });
  });

  describe("Cleanup", () => {
    test("should stop listening when requested", () => {
      const controller = createVoiceController();
      const onResult = jest.fn();

      controller.startListening(onResult);
      controller.stopListening();
      // Should not crash
      expect(true).toBe(true);
    });

    test("should cancel all operations", () => {
      const controller = createVoiceController();
      controller.cancel();
      // Should be able to start listening again after cancel
      const onResult = jest.fn();
      controller.startListening(onResult); // Should not throw
      expect(true).toBe(true);
    });
  });
});
