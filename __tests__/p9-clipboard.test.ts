/**
 * P9 Tests — Clipboard Integration
 */

import { readClipboard, writeClipboard, clearClipboard, isCredentialLike } from "@/lib/macos/clipboard";

describe("P9 — Clipboard", () => {
  test("isCredentialLike detects API keys", () => {
    expect(isCredentialLike("api_key=sk-1234567890abcdef1234")).toBe(true);
    expect(isCredentialLike("AKIA1234567890ABCDEF")).toBe(true);
    expect(isCredentialLike("ghp_1234567890abcdefghijklmnopqrstuvwxyz123456")).toBe(true);
  });

  test("isCredentialLike detects tokens", () => {
    expect(isCredentialLike("bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U")).toBe(true);
    expect(isCredentialLike("xoxb-1234-5678-abcdefgh")).toBe(true);
  });

  test("isCredentialLike detects private keys", () => {
    expect(isCredentialLike("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
  });

  test("isCredentialLike detects credit card numbers", () => {
    expect(isCredentialLike("4111 1111 1111 1111")).toBe(true);
    expect(isCredentialLike("4111-1111-1111-1111")).toBe(true);
  });

  test("isCredentialLike does not flag normal text", () => {
    expect(isCredentialLike("Hello, this is a normal message")).toBe(false);
    expect(isCredentialLike("The quick brown fox jumps over the lazy dog")).toBe(false);
    expect(isCredentialLike("Meeting at 3 PM tomorrow")).toBe(false);
  });

  test("readClipboard returns structured result", () => {
    const result = readClipboard();
    expect(typeof result.available).toBe("boolean");
    if (result.available) {
      expect(typeof result.content).toBe("string");
      expect(typeof result.length).toBe("number");
      expect(typeof result.isCredentialLike).toBe("boolean");
    }
  });

  test("writeClipboard returns success", () => {
    if (process.platform !== "darwin") return;
    const result = writeClipboard("test clipboard content");
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });

  test("clearClipboard returns success", () => {
    if (process.platform !== "darwin") return;
    const result = clearClipboard();
    expect(typeof result.success).toBe("boolean");
  });

  test("writeClipboard handles empty string", () => {
    const result = writeClipboard("");
    expect(result.success).toBe(false);
  });

  test("writeClipboard handles non-string input", () => {
    // @ts-expect-error testing invalid input
    const result = writeClipboard(123);
    expect(result.success).toBe(false);
  });
});
