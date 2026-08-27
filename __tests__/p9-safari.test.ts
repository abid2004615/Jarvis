/**
 * P9 Tests — Safari Integration
 */

import { validateUrl, isSafariRunning, getSafariState, openUrlInSafari, newSafariTab, closeSafari, closeSafariTab } from "@/lib/macos/apps/safari";

describe("P9 — Safari Integration", () => {
  test("validateUrl accepts safe http URLs", () => {
    expect(validateUrl("http://example.com").valid).toBe(true);
  });

  test("validateUrl accepts safe https URLs", () => {
    expect(validateUrl("https://example.com").valid).toBe(true);
  });

  test("validateUrl rejects javascript: URLs", () => {
    const result = validateUrl("javascript:alert(1)");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  test("validateUrl rejects file: URLs", () => {
    expect(validateUrl("file:///etc/passwd").valid).toBe(false);
  });

  test("validateUrl rejects data: URLs", () => {
    expect(validateUrl("data:text/html,<script>alert(1)</script>").valid).toBe(false);
  });

  test("validateUrl rejects credential-bearing URLs", () => {
    expect(validateUrl("https://user:pass@example.com").valid).toBe(false);
  });

  test("validateUrl rejects empty input", () => {
    expect(validateUrl("").valid).toBe(false);
  });

  test("validateUrl rejects non-string input", () => {
    // @ts-expect-error testing invalid input
    expect(validateUrl(123).valid).toBe(false);
  });

  test("validateUrl rejects ftp: URLs", () => {
    expect(validateUrl("ftp://example.com").valid).toBe(false);
  });

  test("isSafariRunning returns boolean", () => {
    const result = isSafariRunning();
    expect(typeof result).toBe("boolean");
  });

  test("getSafariState returns structured result", () => {
    const result = getSafariState();
    expect(typeof result.available).toBe("boolean");
    expect(typeof result.isRunning).toBe("boolean");
  });

  test("openUrlInSafari rejects unsafe URLs", () => {
    const result = openUrlInSafari("javascript:alert(1)");
    expect(result.success).toBe(false);
  });

  test("newSafariTab returns structured result", () => {
    const result = newSafariTab();
    expect(typeof result.success).toBe("boolean");
  });

  test("closeSafari returns structured result", () => {
    const result = closeSafari();
    expect(typeof result.success).toBe("boolean");
  });

  test("closeSafariTab returns structured result", () => {
    const result = closeSafariTab();
    expect(typeof result.success).toBe("boolean");
  });
});
