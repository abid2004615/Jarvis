/**
 * Tool Registry and Permission System
 * Defines the structure of tools and their permissions
 */

export type RiskLevel = "safe" | "confirmation" | "restricted";

/**
 * JSON schema for tool input validation
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * A tool that can be executed by the AI
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  riskLevel: RiskLevel;
  requiresUserConfirmation: boolean;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Permission check result
 */
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
}

/**
 * Tool Registry - manages all available tools and their permissions
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a new tool
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools for AI context (excludes execute function)
   */
  getToolsForAI(): Array<{
    name: string;
    description: string;
    inputSchema: JSONSchema;
  }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get tool by name, raise error if not found
   */
  getToolOrThrow(name: string): ToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found in registry`);
    }
    return tool;
  }
}

/**
 * Tool Permission Manager - evaluates if a tool can be executed
 */
export class ToolPermissionManager {
  private registry: ToolRegistry;
  private restrictedTools: Set<string> = new Set();
  private userConfirmationCallback?: (tool: string, args: Record<string, unknown>) => Promise<boolean>;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  /**
   * Mark a tool as restricted (cannot be executed)
   */
  restrictTool(toolName: string): void {
    this.restrictedTools.add(toolName);
  }

  /**
   * Mark a tool as unrestricted
   */
  allowTool(toolName: string): void {
    this.restrictedTools.delete(toolName);
  }

  /**
   * Set callback for user confirmation
   */
  setUserConfirmationCallback(callback: (tool: string, args: Record<string, unknown>) => Promise<boolean>): void {
    this.userConfirmationCallback = callback;
  }

  /**
   * Check if a tool can be executed
   */
  async canExecute(toolName: string, args: Record<string, unknown>): Promise<PermissionResult> {
    // Check if tool exists
    if (!this.registry.hasTool(toolName)) {
      return {
        allowed: false,
        reason: `Tool '${toolName}' not found`,
      };
    }

    // Check if tool is restricted
    if (this.restrictedTools.has(toolName)) {
      return {
        allowed: false,
        reason: `Tool '${toolName}' is restricted`,
      };
    }

    const tool = this.registry.getToolOrThrow(toolName);

    // Check if tool requires confirmation
    if (tool.requiresUserConfirmation || tool.riskLevel === "confirmation" || tool.riskLevel === "restricted") {
      if (!this.userConfirmationCallback) {
        return {
          allowed: false,
          reason: `Tool '${toolName}' requires user confirmation, but no callback is configured`,
        };
      }

      const confirmed = await this.userConfirmationCallback(toolName, args);
      if (!confirmed) {
        return {
          allowed: false,
          reason: `User declined tool execution`,
        };
      }
    }

    return {
      allowed: true,
      requiresConfirmation: tool.riskLevel !== "safe",
    };
  }
}

/**
 * Input validator using simple JSON schema validation
 */
export class ToolInputValidator {
  /**
   * Validate tool input against schema
   */
  static validate(input: unknown, schema: JSONSchema): { valid: boolean; error?: string } {
    if (typeof schema !== "object" || schema === null) {
      return { valid: false, error: "Invalid schema" };
    }

    // Type check
    if (schema.type) {
      const actualType = Array.isArray(input) ? "array" : typeof input;
      if (actualType !== schema.type) {
        return {
          valid: false,
          error: `Expected ${schema.type}, got ${actualType}`,
        };
      }
    }

    // Required properties check
    if (schema.required && typeof input === "object" && input !== null) {
      const obj = input as Record<string, unknown>;
      for (const required of schema.required) {
        if (!(required in obj)) {
          return {
            valid: false,
            error: `Missing required property: ${required}`,
          };
        }
      }
    }

    // Additional properties check
    if (schema.additionalProperties === false && typeof input === "object" && input !== null) {
      const obj = input as Record<string, unknown>;
      const schemaProps = schema.properties ? Object.keys(schema.properties) : [];
      for (const key of Object.keys(obj)) {
        if (!schemaProps.includes(key)) {
          return {
            valid: false,
            error: `Additional property not allowed: ${key}`,
          };
        }
      }
    }

    return { valid: true };
  }
}
