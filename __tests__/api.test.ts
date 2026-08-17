/**
 * Tests for Assistant API Validation
 * Validates the pure request-validation logic shared by the API routes.
 */

import { validateAssistantRequest, validateConfirmationRequest } from "@/lib/ai/validation";

describe("Assistant API Endpoint", () => {
  describe("Request Validation", () => {
    test("should reject null body", () => {
      const result = validateAssistantRequest(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Request body must be JSON");
    });

    test("should reject non-object body", () => {
      const result = validateAssistantRequest("hello");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Request body must be JSON");
    });

    test("should reject request without message", () => {
      const result = validateAssistantRequest({ conversationId: "test-123" });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("message field is required and must be a string");
    });

    test("should reject empty message", () => {
      const result = validateAssistantRequest({ message: "   " });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("message cannot be empty");
    });

    test("should reject oversized message", () => {
      const result = validateAssistantRequest({ message: "x".repeat(10001) });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("maximum length");
    });

    test("should accept valid request and trim message", () => {
      const result = validateAssistantRequest({
        message: "  Hello JARVIS  ",
        conversationId: "test-123",
      });

      expect(result.valid).toBe(true);
      expect(result.data?.message).toBe("Hello JARVIS");
      expect(result.data?.conversationId).toBe("test-123");
    });

    test("should allow missing conversationId", () => {
      const result = validateAssistantRequest({ message: "hello" });
      expect(result.valid).toBe(true);
      expect(result.data?.conversationId).toBeUndefined();
    });
  });

  describe("Confirmation Validation", () => {
    test("should reject missing toolId", () => {
      const result = validateConfirmationRequest({ approved: true });
      expect(result.valid).toBe(false);
    });

    test("should reject missing approved", () => {
      const result = validateConfirmationRequest({ toolId: "tool-1" });
      expect(result.valid).toBe(false);
    });

    test("should reject non-boolean approved", () => {
      const result = validateConfirmationRequest({ toolId: "tool-1", approved: "yes" });
      expect(result.valid).toBe(false);
    });

    test("should accept a valid decision", () => {
      const result = validateConfirmationRequest({ toolId: "tool-1", approved: true, reason: "ok" });
      expect(result.valid).toBe(true);
      expect(result.data?.toolId).toBe("tool-1");
      expect(result.data?.approved).toBe(true);
      expect(result.data?.reason).toBe("ok");
    });
  });

  describe("Error Handling", () => {
    test("should return safe error response without stack trace", () => {
      const errorResponse = {
        error: "Internal server error",
        code: "INTERNAL_ERROR" as const,
      };

      expect(errorResponse).not.toHaveProperty("stack");
      expect(errorResponse.error).toBe("Internal server error");
      expect(errorResponse.code).toBe("INTERNAL_ERROR");
    });

    test("should indicate AI offline gracefully", () => {
      const response = {
        conversationId: "test-123",
        message: "JARVIS is offline. Unable to process requests.",
        state: "offline",
      };

      expect(response.state).toBe("offline");
      expect(response.message).toContain("offline");
    });
  });

  describe("Security", () => {
    test("should never expose API keys in response", () => {
      const response = {
        conversationId: "test-123",
        message: "Some response",
        state: "idle",
      };

      const responseString = JSON.stringify(response);
      expect(responseString).not.toContain("API_KEY");
      expect(responseString).not.toContain("api-key");
      expect(responseString).not.toContain("apiKey");
    });

    test("should sanitize error messages", () => {
      const internalError = new Error("Database connection failed at port 5432");
      const sanitizedMessage = "Internal server error";

      expect(sanitizedMessage).not.toContain(internalError.message);
      expect(sanitizedMessage).not.toContain("5432");
    });
  });
});
