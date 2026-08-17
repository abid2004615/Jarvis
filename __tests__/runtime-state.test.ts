/**
 * Tests for JARVIS Runtime State Machine
 * Validates state transitions and orb mode mapping
 */

import { JarvisRuntimeState, RUNTIME_STATE_TO_ORB_MODE } from "@/lib/runtime/types";

describe("JARVIS Runtime State Machine", () => {
  describe("Runtime State Enum", () => {
    test("should have all required states", () => {
      expect(JarvisRuntimeState.IDLE).toBe("idle");
      expect(JarvisRuntimeState.LISTENING).toBe("listening");
      expect(JarvisRuntimeState.THINKING).toBe("thinking");
      expect(JarvisRuntimeState.EXECUTING).toBe("executing");
      expect(JarvisRuntimeState.WAITING_FOR_CONFIRMATION).toBe("waiting_for_confirmation");
      expect(JarvisRuntimeState.RESPONDING).toBe("responding");
      expect(JarvisRuntimeState.PLANNING).toBe("planning");
      expect(JarvisRuntimeState.ERROR).toBe("error");
      expect(JarvisRuntimeState.OFFLINE).toBe("offline");
    });

    test("should have 9 states total", () => {
      const states = Object.values(JarvisRuntimeState);
      expect(states).toHaveLength(9);
    });
  });

  describe("State to Orb Mode Mapping", () => {
    test("IDLE should map to IDLE", () => {
      expect(RUNTIME_STATE_TO_ORB_MODE[JarvisRuntimeState.IDLE]).toBe("IDLE");
    });

    test("LISTENING should map to LISTENING", () => {
      expect(RUNTIME_STATE_TO_ORB_MODE[JarvisRuntimeState.LISTENING]).toBe("LISTENING");
    });

    test("THINKING should map to THINKING", () => {
      expect(RUNTIME_STATE_TO_ORB_MODE[JarvisRuntimeState.THINKING]).toBe("THINKING");
    });

    test("PLANNING should map to THINKING", () => {
      expect(RUNTIME_STATE_TO_ORB_MODE[JarvisRuntimeState.PLANNING]).toBe("THINKING");
    });

    test("EXECUTING should map to PROCESSING", () => {
      expect(RUNTIME_STATE_TO_ORB_MODE[JarvisRuntimeState.EXECUTING]).toBe("PROCESSING");
    });

    test("WAITING_FOR_CONFIRMATION should map to SYSTEM", () => {
      expect(RUNTIME_STATE_TO_ORB_MODE[JarvisRuntimeState.WAITING_FOR_CONFIRMATION]).toBe("SYSTEM");
    });

    test("RESPONDING should map to SPEAKING", () => {
      expect(RUNTIME_STATE_TO_ORB_MODE[JarvisRuntimeState.RESPONDING]).toBe("SPEAKING");
    });

    test("ERROR should map to ERROR", () => {
      expect(RUNTIME_STATE_TO_ORB_MODE[JarvisRuntimeState.ERROR]).toBe("ERROR");
    });

    test("OFFLINE should map to ALERT", () => {
      expect(RUNTIME_STATE_TO_ORB_MODE[JarvisRuntimeState.OFFLINE]).toBe("ALERT");
    });

    test("should have mapping for all states", () => {
      for (const state of Object.values(JarvisRuntimeState)) {
        expect(RUNTIME_STATE_TO_ORB_MODE[state]).toBeDefined();
      }
    });
  });

  describe("Orb Mode Values", () => {
    test("all mapped orb modes should be valid", () => {
      const validModes = ["IDLE", "LISTENING", "THINKING", "PROCESSING", "SYSTEM", "SPEAKING", "ERROR", "ALERT", "SUCCESS"];
      for (const mode of Object.values(RUNTIME_STATE_TO_ORB_MODE)) {
        expect(validModes).toContain(mode);
      }
    });
  });
});
