/**
 * Tool Confirmation Manager
 * Handles requesting and managing tool execution confirmations
 */

import { getToolRegistry, sanitizeArguments, describeToolAction } from "@/lib/tools/registry";

export interface ConfirmationRequest {
  id: string;
  toolName: string;
  description: string;
  humanReadableAction: string;
  safeArguments: Record<string, unknown>;
  riskLevel: "safe" | "confirmation" | "restricted";
}

interface ConfirmationResponse {
  requestId: string;
  approved: boolean;
  reason?: string;
}

/**
 * Confirmation Manager
 * Tracks and manages tool execution confirmations
 */
export class ConfirmationManager {
  private requests: Map<string, ConfirmationRequest> = new Map();
  private responses: Map<string, ConfirmationResponse> = new Map();
  private listeners: Set<(request: ConfirmationRequest) => void> = new Set();

  /**
   * Request confirmation for a tool
   */
  requestToolConfirmation(toolName: string, args: Record<string, unknown> = {}): ConfirmationRequest | null {
    const registry = getToolRegistry();
    const tool = registry.getTool(toolName);

    if (!tool || !tool.requiresUserConfirmation) {
      return null;
    }

    // Sanitize arguments (remove secrets)
    const safeArgs = sanitizeArguments(args);

    // Generate human-readable action
    const action = describeToolAction(toolName, tool.description, safeArgs);

    const request: ConfirmationRequest = {
      id: `confirm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      toolName,
      description: tool.description,
      humanReadableAction: action,
      safeArguments: safeArgs,
      riskLevel: tool.riskLevel,
    };

    this.requests.set(request.id, request);

    // Notify listeners
    for (const listener of this.listeners) {
      listener(request);
    }

    return request;
  }

  /**
   * Handle confirmation response
   */
  respondToConfirmation(requestId: string, approved: boolean, reason?: string): boolean {
    const request = this.requests.get(requestId);
    if (!request) {
      return false;
    }

    const response: ConfirmationResponse = {
      requestId,
      approved,
      reason,
    };

    this.responses.set(requestId, response);
    this.requests.delete(requestId);

    return true;
  }

  /**
   * Get confirmation response (blocking until response is available)
   * In a real implementation, this would use async/await with proper event handling
   */
  getConfirmationResponse(requestId: string, timeoutMs: number = 30000): ConfirmationResponse | null {
    const response = this.responses.get(requestId);
    if (response) {
      this.responses.delete(requestId);
      return response;
    }
    return null;
  }

  /**
   * Subscribe to confirmation requests
   */
  onConfirmationRequest(listener: (request: ConfirmationRequest) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get pending confirmation
   */
  getPendingConfirmation(requestId: string): ConfirmationRequest | null {
    return this.requests.get(requestId) || null;
  }

  /**
   * Get all pending confirmations
   */
  getPendingConfirmations(): ConfirmationRequest[] {
    return Array.from(this.requests.values());
  }

  /**
   * Cancel a confirmation request
   */
  cancelConfirmation(requestId: string): boolean {
    if (!this.requests.has(requestId)) {
      return false;
    }
    this.requests.delete(requestId);
    return true;
  }

  /**
   * Clear all pending confirmations
   */
  clear(): void {
    this.requests.clear();
    this.responses.clear();
  }
}

// Singleton instance
let instance: ConfirmationManager | null = null;

export function getConfirmationManager(): ConfirmationManager {
  if (!instance) {
    instance = new ConfirmationManager();
  }
  return instance;
}

export function resetConfirmationManager(): void {
  if (instance) {
    instance.clear();
    instance = null;
  }
}
