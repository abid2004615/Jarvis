/**
 * P10 Tests — Rate Limiter
 */

import {
  resetChainCounters,
  setRateLimitConfig,
  getRateLimitConfig,
  canPerformAction,
  canAttemptResolution,
  canRetry,
  canCaptureScreenshot,
  getCurrentCounters,
} from "@/lib/computer-use/rate-limiter";

describe("P10 Rate Limiter", () => {
  beforeEach(() => {
    resetChainCounters();
    setRateLimitConfig({});
  });

  describe("resetChainCounters", () => {
    it("should reset all counters to zero", () => {
      canPerformAction("click");
      canPerformAction("click");
      resetChainCounters();
      const counters = getCurrentCounters();
      expect(counters.actions).toBe(0);
      expect(counters.clicks).toBe(0);
    });
  });

  describe("setRateLimitConfig / getRateLimitConfig", () => {
    it("should return defaults initially", () => {
      const config = getRateLimitConfig();
      expect(config.maxActionsPerChain).toBe(10);
      expect(config.maxClicksPerChain).toBe(8);
    });

    it("should update config", () => {
      setRateLimitConfig({ maxActionsPerChain: 5 });
      const config = getRateLimitConfig();
      expect(config.maxActionsPerChain).toBe(5);
      // Other values should remain default
      expect(config.maxClicksPerChain).toBe(8);
    });
  });

  describe("canPerformAction", () => {
    it("should allow first action", () => {
      const result = canPerformAction("click");
      expect(result.allowed).toBe(true);
    });

    it("should count clicks", () => {
      canPerformAction("click");
      canPerformAction("click");
      canPerformAction("double_click");
      const counters = getCurrentCounters();
      expect(counters.clicks).toBe(3);
    });

    it("should count typing operations", () => {
      canPerformAction("type");
      canPerformAction("type");
      const counters = getCurrentCounters();
      expect(counters.typingOps).toBe(2);
    });

    it("should enforce click limit", () => {
      setRateLimitConfig({ maxClicksPerChain: 3 });
      canPerformAction("click");
      canPerformAction("click");
      canPerformAction("click");
      const result = canPerformAction("click");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("clicks per chain");
    });

    it("should enforce typing limit", () => {
      setRateLimitConfig({ maxTypingOperations: 2 });
      canPerformAction("type");
      canPerformAction("type");
      const result = canPerformAction("type");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("typing operations");
    });

    it("should enforce total action limit", () => {
      setRateLimitConfig({ maxActionsPerChain: 3 });
      canPerformAction("scroll");
      canPerformAction("scroll");
      canPerformAction("scroll");
      const result = canPerformAction("scroll");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("actions per chain");
    });
  });

  describe("canAttemptResolution", () => {
    it("should allow first attempt", () => {
      const result = canAttemptResolution();
      expect(result.allowed).toBe(true);
    });

    it("should enforce resolution attempt limit", () => {
      setRateLimitConfig({ maxTargetResolutionAttempts: 2 });
      canAttemptResolution();
      canAttemptResolution();
      const result = canAttemptResolution();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("target resolution attempts");
    });
  });

  describe("canRetry", () => {
    it("should allow first retry", () => {
      const result = canRetry();
      expect(result.allowed).toBe(true);
    });

    it("should enforce retry limit", () => {
      setRateLimitConfig({ maxRetriesPerAction: 1 });
      canRetry();
      const result = canRetry();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("retries per action");
    });
  });

  describe("canCaptureScreenshot", () => {
    it("should allow first capture", () => {
      const result = canCaptureScreenshot();
      expect(result.allowed).toBe(true);
    });

    it("should enforce screenshot limit", () => {
      setRateLimitConfig({ maxScreenshotsPerAction: 1 });
      canCaptureScreenshot();
      const result = canCaptureScreenshot();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("screenshots per action");
    });
  });
});
