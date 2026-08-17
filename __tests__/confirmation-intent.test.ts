/**
 * Tests for natural-language confirmation intent classification.
 * These run only on the server when a pending confirmation exists for the
 * conversation — normal conversation is never intercepted.
 */

import { classifyConfirmationIntent } from "@/lib/runtime/confirmation-intent";

describe("classifyConfirmationIntent", () => {
  describe("approval", () => {
    test.each([
      "yes",
      "yeah",
      "yep",
      "sure",
      "ok",
      "okay",
      "allow",
      "confirm",
      "do it",
      "do it now",
      "yes do it",
      "go ahead",
      "open it",
      "please do",
      "sure do it",
      "YES",
      "  Yes!  ",
    ])("classifies %p as approve", (input) => {
      expect(classifyConfirmationIntent(input)).toBe("approve");
    });
  });

  describe("denial", () => {
    test.each([
      "no",
      "nope",
      "cancel",
      "skip",
      "stop",
      "abort",
      "dismiss",
      "forget it",
      "leave it",
      "never mind",
      "nevermind",
      "not now",
      "no thanks",
      "don't",
      "dont",
      "don't do it",
      "don't do that",
      "actually don't",
      "actually dont",
      "no don't",
    ])("classifies %p as deny", (input) => {
      expect(classifyConfirmationIntent(input)).toBe("deny");
    });
  });

  describe("non-decisions", () => {
    test.each([
      "",
      "   ",
      "tell me about the weather",
      "what time is it",
      "can you explain that in more detail please",
      "open a new tab in the browser",
      "maybe later, but not right now though",
    ])("returns null for ambiguous input %p", (input) => {
      expect(classifyConfirmationIntent(input)).toBeNull();
    });
  });
});
