/**
 * P9 Tests — Security
 * Verifies rejection of unsafe operations.
 */

import { validateUrl } from "@/lib/macos/apps/safari";
import { isCredentialLike } from "@/lib/macos/clipboard";
import { createFolder } from "@/lib/macos/files";

describe("P9 — Security", () => {
  describe("URL validation", () => {
    test("rejects javascript: scheme", () => {
      expect(validateUrl("javascript:alert(document.cookie)").valid).toBe(false);
    });

    test("rejects file: scheme", () => {
      expect(validateUrl("file:///etc/passwd").valid).toBe(false);
    });

    test("rejects data: scheme", () => {
      expect(validateUrl("data:text/html,<script>alert(1)</script>").valid).toBe(false);
    });

    test("rejects ftp: scheme", () => {
      expect(validateUrl("ftp://malicious.com/payload").valid).toBe(false);
    });

    test("rejects credential-bearing URLs", () => {
      expect(validateUrl("https://admin:password123@example.com").valid).toBe(false);
    });

    test("accepts safe https URLs", () => {
      expect(validateUrl("https://example.com").valid).toBe(true);
    });

    test("accepts safe http URLs", () => {
      expect(validateUrl("http://localhost:3000").valid).toBe(true);
    });
  });

  describe("Credential detection", () => {
    test("detects API keys", () => {
      expect(isCredentialLike("sk-proj-abc123def456ghi789jkl012")).toBe(true);
    });

    test("detects AWS keys", () => {
      expect(isCredentialLike("AKIA1234567890ABCDEF")).toBe(true);
    });

    test("detects GitHub tokens", () => {
      expect(isCredentialLike("ghp_abcdefghijklmnopqrstuvwxyz123456")).toBe(true);
    });

    test("detects Slack tokens", () => {
      expect(isCredentialLike("xoxb-1234-5678-abcdefghijklmnop")).toBe(true);
    });

    test("detects private keys", () => {
      expect(isCredentialLike("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
    });

    test("does not flag normal text", () => {
      expect(isCredentialLike("Hello, this is a normal message about meetings")).toBe(false);
    });

    test("does not flag code snippets without secrets", () => {
      expect(isCredentialLike("const x = 42;")).toBe(false);
    });
  });

  describe("File security", () => {
    test("rejects traversal in folder creation", () => {
      expect(createFolder("Downloads", "../etc").success).toBe(false);
    });

    test("rejects hidden folder creation", () => {
      expect(createFolder("Downloads", ".hidden_folder").success).toBe(false);
    });

    test("rejects traversal with multiple dots", () => {
      expect(createFolder("Downloads", "../../..").success).toBe(false);
    });

    test("rejects slash in folder name", () => {
      expect(createFolder("Downloads", "foo/bar").success).toBe(false);
    });
  });
});
