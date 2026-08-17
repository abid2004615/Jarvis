/**
 * Safe Initial Tool Implementations
 * Non-destructive tools for system information and status
 */

import type { ToolDefinition, ToolRegistry as ToolRegistryType } from "./types";
import {
  getCPUUsage,
  getMemoryUsage,
  getDiskUsage,
  getBatteryStatus,
  getNetworkStatus,
  getSystemUptime,
  getProcessSummary,
  getSystemTelemetry,
  launchApplication,
  quitApplication,
  getFrontmostApplication,
  getRunningApplications,
  getVolumeStatus,
  setVolume,
  getBrightnessStatus,
  setBrightness,
  openFolder,
  takeScreenshot,
  getActiveWindow,
} from "@/lib/macos";
import { ToolRegistry, ToolInputValidator } from "./types";
import { getMemoryManager, type MemoryCategory } from "@/lib/memory";

/**
 * Get current system time
 */
export const GET_CURRENT_TIME_TOOL: ToolDefinition = {
  name: "get_current_time",
  description: "Get the current system time and date",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    return {
      iso: new Date().toISOString(),
      unix: Date.now(),
      readable: new Date().toLocaleString(),
    };
  },
};

/**
 * Get system status (CPU, memory, network, battery, etc.)
 */
export const GET_SYSTEM_STATUS_TOOL: ToolDefinition = {
  name: "get_system_status",
  description: "Get current system status including CPU, memory, network, and battery metrics",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    // Note: This should be called server-side where actual system metrics are available
    return {
      cpu: 42,
      memory: 72,
      network: 18,
      battery: 84,
      uptime: 1880,
      disk: 61,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Get app status
 */
export const GET_APP_STATUS_TOOL: ToolDefinition = {
  name: "get_app_status",
  description: "Get current JARVIS application status",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    return {
      name: "JARVIS",
      version: "1.0.0",
      status: "online",
      features: ["orb", "hand-tracking", "voice-recognition", "ai-assistant"],
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Echo tool for testing
 */
export const ECHO_TOOL: ToolDefinition = {
  name: "echo",
  description: "Echo back a message (for testing)",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
    },
    required: ["message"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input: Record<string, unknown>) => {
    return {
      echoed: input.message,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * List available tools
 */
export const LIST_TOOLS_TOOL: ToolDefinition = {
  name: "list_available_tools",
  description: "List all available tools that the assistant can use",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    return {
      tools: [
        "get_current_time",
        "get_system_status",
        "get_app_status",
        "get_cpu_usage",
        "get_memory_usage",
        "get_disk_usage",
        "get_battery_status",
        "get_network_status",
        "get_system_uptime",
        "get_process_summary",
        "get_volume_status",
        "get_brightness_status",
        "get_frontmost_application",
        "get_running_applications",
        "get_system_summary",
        "get_active_window",
        "launch_application",
        "quit_application",
        "open_folder",
        "set_volume",
        "set_brightness",
        "take_screenshot",
        "echo",
        "list_available_tools",
        "remember_user_preference",
        "recall_user_memory",
        "list_user_memories",
        "forget_user_memory",
        "clear_user_memory",
      ],
      count: 29,
    };
  },
};

/**
 * Get CPU usage - real macOS data
 */
export const GET_CPU_USAGE_TOOL: ToolDefinition = {
  name: "get_cpu_usage",
  description: "Get current CPU usage percentage and core count",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getCPUUsage();
    if (!result.available) {
      return {
        available: false,
        error: result.error || "Could not retrieve CPU usage",
      };
    }
    return {
      available: true,
      percentUsed: result.percentUsed,
      coreCount: result.coreCount,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Get memory usage - real macOS data
 */
export const GET_MEMORY_USAGE_TOOL: ToolDefinition = {
  name: "get_memory_usage",
  description: "Get current memory usage in GB and percentage",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getMemoryUsage();
    if (!result.available) {
      return {
        available: false,
        error: result.error || "Could not retrieve memory usage",
      };
    }
    return {
      available: true,
      usedGB: result.usedGB,
      totalGB: result.totalGB,
      percentUsed: result.percentUsed,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Get disk usage - real macOS data
 */
export const GET_DISK_USAGE_TOOL: ToolDefinition = {
  name: "get_disk_usage",
  description: "Get current disk usage in GB and percentage for the root volume",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getDiskUsage();
    if (!result.available) {
      return {
        available: false,
        error: result.error || "Could not retrieve disk usage",
      };
    }
    return {
      available: true,
      usedGB: result.usedGB,
      totalGB: result.totalGB,
      percentUsed: result.percentUsed,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Get battery status - real macOS data
 */
export const GET_BATTERY_STATUS_TOOL: ToolDefinition = {
  name: "get_battery_status",
  description: "Get current battery charge percentage and charging status",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getBatteryStatus();
    if (!result.available) {
      return {
        available: false,
        error: result.error || "Could not retrieve battery status",
      };
    }
    return {
      available: true,
      percentCharged: result.percentCharged,
      isCharging: result.isCharging,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Get network status - real macOS data
 */
export const GET_NETWORK_STATUS_TOOL: ToolDefinition = {
  name: "get_network_status",
  description: "Get network interface statistics and throughput",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getNetworkStatus();
    if (!result.available) {
      return {
        available: false,
        error: result.error || "Could not retrieve network status",
      };
    }
    return {
      available: true,
      bytesReceivedPerSecond: result.bytesReceivedPerSecond,
      bytesSentPerSecond: result.bytesSentPerSecond,
      megabitsPerSecondIn: result.megabitsPerSecondIn,
      megabitsPerSecondOut: result.megabitsPerSecondOut,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Get system uptime - real macOS data
 */
export const GET_SYSTEM_UPTIME_TOOL: ToolDefinition = {
  name: "get_system_uptime",
  description: "Get system uptime in seconds since last boot",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getSystemUptime();
    if (!result.available) {
      return {
        available: false,
        error: result.error || "Could not retrieve system uptime",
      };
    }
    return {
      available: true,
      uptimeSeconds: result.uptimeSeconds,
      uptimeHours: Number((result.uptimeSeconds! / 3600).toFixed(1)),
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Get process summary - real macOS data
 */
export const GET_PROCESS_SUMMARY_TOOL: ToolDefinition = {
  name: "get_process_summary",
  description: "Get summary of top processes by CPU and memory usage",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getProcessSummary();
    if (!result.available) {
      return {
        available: false,
        error: result.error || "Could not retrieve process summary",
      };
    }
    return {
      available: true,
      topProcessesByCPU: result.topProcessesByCPU,
      totalProcessCount: result.totalProcessCount,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Launch an application - safe allowlist, but requires explicit user confirmation
 * because it is a side-effecting action on the user's system.
 */
export const LAUNCH_APPLICATION_TOOL: ToolDefinition = {
  name: "launch_application",
  description:
    "Launch an allowlisted macOS application (e.g. Safari, Chrome, Spotify, Finder, Notes, Calculator). Call this directly whenever the user asks to open, launch, start, or run an application — do not ask the user to confirm first; a confirmation prompt is shown automatically and the action only runs after they approve. The application is resolved against an internal allowlist; arbitrary processes are never launched.",
  inputSchema: {
    type: "object",
    properties: {
      application: {
        type: "string",
        description: "Name of the application to launch (must be on allowlist)",
      },
    },
    required: ["application"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input: Record<string, unknown>) => {
    const appName = input.application as string;
    if (!appName || typeof appName !== "string") {
      return {
        success: false,
        message: "application parameter must be a non-empty string",
      };
    }

    const result = launchApplication(appName);
    return {
      success: result.success,
      application: result.application,
      message: result.message,
      pid: result.pid,
    };
  },
};

/**
 * Quit an allowlisted macOS application. Requires confirmation; only apps on
 * the allowlist can be quit — arbitrary processes are never terminated.
 */
export const QUIT_APPLICATION_TOOL: ToolDefinition = {
  name: "quit_application",
  description:
    "Quit an allowlisted macOS application (e.g. Safari, Chrome, Spotify, Finder). Use only when the user explicitly asks to close, quit, or exit an application. The application is resolved against the allowlist; arbitrary processes are never terminated. This action requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      application: {
        type: "string",
        description: "Name of the application to quit (must be on the allowlist)",
      },
    },
    required: ["application"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input: Record<string, unknown>) => {
    const appName = input.application as string;
    if (!appName || typeof appName !== "string") {
      return {
        success: false,
        message: "application parameter must be a non-empty string",
      };
    }

    const result = quitApplication(appName);
    return {
      success: result.success,
      application: result.application,
      message: result.message,
    };
  },
};

/**
 * Open a user folder in Finder. Only allowlisted folders resolve; arbitrary
 * filesystem paths and path traversal are rejected. Requires confirmation.
 */
export const OPEN_FOLDER_TOOL: ToolDefinition = {
  name: "open_folder",
  description:
    "Open a user folder (Downloads, Documents, Desktop, Pictures, Movies, or Music) in Finder. The folder is resolved internally from an allowlist; arbitrary filesystem paths are rejected. Use only when the user asks to open or show a folder. This action requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      folder: {
        type: "string",
        description: "Folder name, e.g. Downloads or Documents",
      },
    },
    required: ["folder"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input: Record<string, unknown>) => {
    const folder = input.folder as string;
    if (!folder || typeof folder !== "string") {
      return {
        success: false,
        message: "folder parameter must be a non-empty string",
      };
    }

    const result = openFolder(folder);
    return {
      success: result.success,
      folder: result.folder,
      message: result.message,
    };
  },
};

/**
 * Get the current output volume and mute state (read-only, safe).
 */
export const GET_VOLUME_STATUS_TOOL: ToolDefinition = {
  name: "get_volume_status",
  description:
    "Get the current Mac system output volume percentage and whether the output is muted. Read-only; it does not change anything. Use when the user asks about their volume, loudness, or mute state.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getVolumeStatus();
    return {
      available: result.available,
      volumePercent: result.volumePercent,
      muted: result.muted,
      error: result.error,
      timestamp: result.timestamp,
    };
  },
};

/**
 * Change the system output volume. Modifies system state; requires
 * confirmation. Values are strictly validated (level 0-100, delta -100..100).
 */
export const SET_VOLUME_TOOL: ToolDefinition = {
  name: "set_volume",
  description:
    "Change the Mac system output volume. Pass level (integer 0-100) to set an absolute level, delta (integer -100 to +100) to adjust relative to the current level, and/or muted (true/false) to mute or unmute. Use for commands like 'turn the volume down', 'raise the volume', or 'mute'. This modifies system state and requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      level: { type: "integer", description: "Absolute volume level 0-100" },
      delta: { type: "integer", description: "Relative adjustment -100 to +100" },
      muted: { type: "boolean", description: "Mute (true) or unmute (false)" },
    },
    required: [],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input: Record<string, unknown>) => {
    const result = setVolume(input);
    return {
      success: result.success,
      message: result.message,
      volumePercent: result.volumePercent,
      muted: result.muted,
      error: result.error,
    };
  },
};

/**
 * Get the current screen brightness (best effort, read-only).
 */
export const GET_BRIGHTNESS_STATUS_TOOL: ToolDefinition = {
  name: "get_brightness_status",
  description:
    "Get the current screen brightness percentage. Read-only. May be unavailable on some Macs — JARVIS will report that honestly rather than guessing.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getBrightnessStatus();
    return {
      available: result.available,
      brightnessPercent: result.brightnessPercent,
      error: result.error,
      timestamp: result.timestamp,
    };
  },
};

/**
 * Change the screen brightness. macOS has no public safe API for this, so
 * the tool returns a structured 'unavailable' result rather than faking it.
 */
export const SET_BRIGHTNESS_TOOL: ToolDefinition = {
  name: "set_brightness",
  description:
    "Change the screen brightness. Note: macOS does not expose a public, safe API for display brightness, so JARVIS returns an honest 'unavailable' result on most systems rather than claiming success. Input is still validated. This action requires user confirmation when a change is requested.",
  inputSchema: {
    type: "object",
    properties: {
      level: { type: "integer", description: "Absolute brightness level 0-100" },
      delta: { type: "integer", description: "Relative adjustment -100 to +100" },
    },
    required: [],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input: Record<string, unknown>) => {
    const result = setBrightness(input);
    return {
      success: result.success,
      message: result.message,
      error: result.error,
    };
  },
};

/**
 * Take a screenshot into the controlled JARVIS directory. Requires
 * confirmation. Output path is controlled internally; never user-supplied.
 */
export const TAKE_SCREENSHOT_TOOL: ToolDefinition = {
  name: "take_screenshot",
  description:
    "Take a screenshot and save it to the JARVIS screenshot directory under Pictures. The output path is controlled internally; arbitrary paths are never accepted. Use only when the user explicitly asks to take a screenshot or capture the screen. This action requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async () => {
    const result = takeScreenshot();
    return {
      success: result.success,
      path: result.path,
      message: result.message,
      error: result.error,
    };
  },
};

/**
 * Get the application currently in the foreground (read-only, safe).
 */
export const GET_FRONTMOST_APPLICATION_TOOL: ToolDefinition = {
  name: "get_frontmost_application",
  description:
    "Get the name of the application currently in the foreground. Read-only; does not change anything. Use when the user asks what app they are currently using or what is in the foreground.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getFrontmostApplication();
    return {
      available: result.available,
      name: result.name,
      error: result.error,
    };
  },
};

/**
 * Get a concise list of running GUI applications (read-only, safe).
 */
export const GET_RUNNING_APPLICATIONS_TOOL: ToolDefinition = {
  name: "get_running_applications",
  description:
    "Get a concise list of currently running GUI applications (bounded to at most 15). Read-only; does not change anything. Use when the user asks what apps are running.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getRunningApplications();
    return {
      available: result.available,
      applications: result.applications,
      error: result.error,
    };
  },
};

/**
 * Get a concise combined system snapshot (read-only, safe).
 * Composes the existing safe telemetry readers with the frontmost application.
 */
export const GET_SYSTEM_SUMMARY_TOOL: ToolDefinition = {
  name: "get_system_summary",
  description:
    "Get a concise summary of the Mac's current state: CPU, memory, disk, battery, network, uptime, and the frontmost application. Read-only; does not change anything. Use when the user asks how their Mac is doing, for an overall status snapshot, or 'what's running', 'how is my Mac', 'system status'.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const telemetry = getSystemTelemetry();
    const frontmost = getFrontmostApplication();
    return {
      available: true,
      cpu: telemetry.cpu,
      memory: telemetry.memory,
      disk: telemetry.disk,
      battery: telemetry.battery,
      network: telemetry.network,
      uptime: telemetry.uptime,
      frontmost,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Get the title of the currently active application window (read-only, safe).
 * macOS requires Accessibility permission for this; when unavailable JARVIS
 * returns an honest `active_window_unavailable` instead of fabricating data.
 */
export const GET_ACTIVE_WINDOW_TOOL: ToolDefinition = {
  name: "get_active_window",
  description:
    "Get the title of the currently active application window. Read-only. Requires macOS accessibility permission for System Events; when that permission is unavailable JARVIS honestly reports the window as unavailable rather than guessing. Use when the user asks what window they are currently looking at.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getActiveWindow();
    if (!result.available) {
      return {
        success: false,
        error: "active_window_unavailable",
        message: "The active window is unavailable on this system.",
      };
    }
    return {
      success: true,
      title: result.title,
      message: "Active window retrieved",
    };
  },
};

/**
 * Persistently save a user preference or fact (read/write, explicit intent only).
 * NEVER called for ordinary statements; the pipeline blocks it unless the user
 * explicitly asked JARVIS to remember something.
 */
export const REMEMBER_USER_PREFERENCE_TOOL: ToolDefinition = {
  name: "remember_user_preference",
  description:
    "Persistently save a user preference, fact, workflow, or communication style — but ONLY when the user explicitly asks you to remember it (e.g. 'remember that I prefer concise answers', 'please remember my usual stack', 'save this preference'). Never call this for ordinary statements like 'I prefer dark mode' or 'I usually use Python' — those do not create persistent memory. Passwords, API keys, tokens, and other secrets are rejected and never stored.",
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: ["preference", "personal_fact", "workflow", "communication_style", "project_context"],
        description: "Category of the memory (defaults to 'preference').",
      },
      key: {
        type: "string",
        description: "Short label for the memory, e.g. 'preferred answer style'.",
      },
      value: {
        type: "string",
        description: "What to remember, e.g. 'concise bullet points'.",
      },
    },
    required: ["key", "value"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input: Record<string, unknown>) => {
    const key = typeof input.key === "string" ? input.key : "";
    const value = typeof input.value === "string" ? input.value : "";
    const category =
      typeof input.category === "string" ? (input.category as MemoryCategory) : undefined;
    const result = getMemoryManager().remember({ category, key, value });
    if (!result.success) {
      return {
        success: false,
        code: result.code,
        message: result.error ?? "Could not save memory",
      };
    }
    return {
      success: true,
      id: result.data?.id,
      category: result.data?.category,
      key: result.data?.key,
      message: "Memory saved",
    };
  },
};

/**
 * Retrieve relevant saved memories (read-only, safe).
 */
export const RECALL_USER_MEMORY_TOOL: ToolDefinition = {
  name: "recall_user_memory",
  description:
    "Retrieve the user's saved memories (preferences, facts, workflows) that are relevant to a query. Use when the user asks what JARVIS remembers about them, e.g. 'what do you remember about me?' or 'what answer style do I prefer?'. Read-only; does not change anything.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Free-text query describing what to recall.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "Maximum number of memories to return (default 5).",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input: Record<string, unknown>) => {
    const query = typeof input.query === "string" ? input.query : "";
    const limit =
      typeof input.limit === "number" ? Math.min(10, Math.max(1, Math.floor(input.limit))) : 5;
    const memories = getMemoryManager().recall(query, limit);
    return {
      count: memories.length,
      memories: memories.map(({ key, value, category }) => ({ key, value, category })),
      message: memories.length > 0 ? "Found memories" : "No matching memories",
    };
  },
};

/**
 * List every saved memory (read-only, safe).
 */
export const LIST_USER_MEMORIES_TOOL: ToolDefinition = {
  name: "list_user_memories",
  description:
    "List every memory currently saved for the user (preferences, facts, workflows). Read-only; does not change anything. Use when the user asks what you have saved about them.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const memories = getMemoryManager().list();
    return {
      count: memories.length,
      memories: memories.map(({ key, value, category, updatedAt }) => ({
        key,
        value,
        category,
        updatedAt,
      })),
      message: memories.length > 0 ? "Memory listed" : "No memories saved",
    };
  },
};

/**
 * Delete one saved memory by key (destructive; requires confirmation).
 */
export const FORGET_USER_MEMORY_TOOL: ToolDefinition = {
  name: "forget_user_memory",
  description:
    "Delete a single saved memory by its key, e.g. 'forget that I prefer concise answers'. Modifies persistent memory and requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      memory_key: {
        type: "string",
        description: "The key of the memory to delete, e.g. 'preferred answer style'.",
      },
    },
    required: ["memory_key"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input: Record<string, unknown>) => {
    const key = typeof input.memory_key === "string" ? input.memory_key : "";
    if (!key) return { success: false, message: "memory_key is required" };
    const result = getMemoryManager().forgetByKey(key);
    if (!result.success) {
      return { success: false, code: result.code, message: "Memory not found" };
    }
    return { success: true, message: "Memory forgotten" };
  },
};

/**
 * Delete all saved memories (destructive; requires confirmation).
 */
export const CLEAR_USER_MEMORY_TOOL: ToolDefinition = {
  name: "clear_user_memory",
  description:
    "Erase ALL of JARVIS's saved memories about the user (preferences, facts, workflows) — not system RAM. Use when the user says things like 'forget everything you remember about me', 'clear my memory', 'erase all your saved preferences', or 'wipe my memory'. Destructive and requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async () => {
    const result = getMemoryManager().clear();
    return {
      success: result.success,
      deleted: result.data,
      message: result.data && result.data > 0 ? "All memories cleared" : "No memories to clear",
    };
  },
};

/**
 * Notify the user through the JARVIS HUD (and voice when the UI is active).
 * Never used for external push/email/SMS. Bounded message length.
 */
export const NOTIFY_USER_TOOL: ToolDefinition = {
  name: "notify_user",
  description:
    "Show the user a short notification in the JARVIS HUD. Use for scheduled or conditional alerts, e.g. 'notify me when the battery drops below 20%'. Never use for external messaging.",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string", description: "The message to show the user" },
    },
    required: ["message"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const message = String(input.message ?? "").trim();
    if (message.length === 0) {
      return { success: false, message: "A message is required" };
    }
    if (message.length > 500) {
      return { success: false, message: "Message exceeds 500 characters" };
    }
    return { success: true, message };
  },
};

/**
 * Get all built-in safe tools
 */
export function getBuiltinTools(): ToolDefinition[] {
  return [
    GET_CURRENT_TIME_TOOL,
    GET_SYSTEM_STATUS_TOOL,
    GET_APP_STATUS_TOOL,
    GET_CPU_USAGE_TOOL,
    GET_MEMORY_USAGE_TOOL,
    GET_DISK_USAGE_TOOL,
    GET_BATTERY_STATUS_TOOL,
    GET_NETWORK_STATUS_TOOL,
    GET_SYSTEM_UPTIME_TOOL,
    GET_PROCESS_SUMMARY_TOOL,
    GET_VOLUME_STATUS_TOOL,
    GET_BRIGHTNESS_STATUS_TOOL,
    GET_FRONTMOST_APPLICATION_TOOL,
    GET_RUNNING_APPLICATIONS_TOOL,
    GET_SYSTEM_SUMMARY_TOOL,
    GET_ACTIVE_WINDOW_TOOL,
    LAUNCH_APPLICATION_TOOL,
    QUIT_APPLICATION_TOOL,
    OPEN_FOLDER_TOOL,
    SET_VOLUME_TOOL,
    SET_BRIGHTNESS_TOOL,
    TAKE_SCREENSHOT_TOOL,
    ECHO_TOOL,
    LIST_TOOLS_TOOL,
    REMEMBER_USER_PREFERENCE_TOOL,
    RECALL_USER_MEMORY_TOOL,
    LIST_USER_MEMORIES_TOOL,
    FORGET_USER_MEMORY_TOOL,
    CLEAR_USER_MEMORY_TOOL,
    NOTIFY_USER_TOOL,
  ];
}

/**
 * Sensitive field names that must never be stored, logged, or displayed.
 */
const SENSITIVE_FIELDS = new Set([
  "password",
  "token",
  "secret",
  "apikey",
  "api_key",
  "key",
  "credential",
  "passwd",
  "pwd",
  "authorization",
  "auth",
]);

/**
 * Recursively redact sensitive values before they are stored or displayed.
 */
export function sanitizeArguments(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeArguments(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Generate a human-readable description of what a tool call will do.
 * Used by the confirmation UI. Never includes secrets (args are pre-sanitized).
 */
export function describeToolAction(
  toolName: string,
  description: string,
  args: Record<string, unknown>,
): string {
  const actionMap: Record<string, (a: Record<string, unknown>) => string> = {
    launch_application: (a) => `Open ${String(a.application ?? "unknown")}?`,
    quit_application: (a) => `Quit ${String(a.application ?? "unknown")}?`,
    open_folder: (a) => `Open your ${String(a.folder ?? "folder")} folder?`,
    set_volume: (a) => {
      if (typeof a.muted === "boolean") {
        return a.muted ? "Mute the Mac?" : "Unmute the Mac?";
      }
      if (typeof a.level === "number") return `Set system volume to ${a.level}%?`;
      if (typeof a.delta === "number") return `Adjust system volume by ${a.delta}%?`;
      return "Change the system volume?";
    },
    set_brightness: (a) => {
      if (typeof a.level === "number") return `Set screen brightness to ${a.level}%?`;
      if (typeof a.delta === "number") return `Adjust screen brightness by ${a.delta}%?`;
      return "Change the screen brightness?";
    },
    take_screenshot: () => "Take a screenshot?",
    get_volume_status: () => "Retrieve current volume status",
    get_brightness_status: () => "Retrieve current screen brightness",
    get_frontmost_application: () => "Retrieve the frontmost application",
    get_running_applications: () => "Retrieve running applications",
    get_system_summary: () => "Retrieve a system summary",
    get_active_window: () => "Retrieve the active window",
    get_cpu_usage: () => "Retrieve CPU usage information",
    get_memory_usage: () => "Retrieve memory usage information",
    get_disk_usage: () => "Retrieve disk usage information",
    get_battery_status: () => "Retrieve battery status",
    get_network_status: () => "Retrieve network status",
    get_system_uptime: () => "Retrieve system uptime",
    get_process_summary: () => "Retrieve process summary",
    get_current_time: () => "Retrieve the current system time",
    get_system_status: () => "Retrieve overall system status",
    get_app_status: () => "Retrieve JARVIS application status",
    echo: (a) => `Echo message: ${String(a.message ?? "unknown")}`,
    remember_user_preference: (a) => `Save to memory: ${String(a.key ?? "unknown")}`,
    recall_user_memory: (a) => `Recall memories about "${String(a.query ?? "")}"`,
    list_user_memories: () => "List saved memories",
    forget_user_memory: (a) => `Forget "${String(a.memory_key ?? "unknown")}" from memory?`,
    clear_user_memory: () => "Clear all saved memories?",
    notify_user: (a) => `Notify you: ${String(a.message ?? "")}`,
    create_automation: (a) => `Create automation "${String(a.name ?? "unknown")}"`,
    update_automation: (a) => `Update automation ${String(a.id ?? "unknown")}`,
    list_automations: () => "List your automations",
    get_automation: (a) => `Get automation ${String(a.id ?? "unknown")}`,
    enable_automation: (a) => `Enable automation ${String(a.id ?? "unknown")}`,
    disable_automation: (a) => `Disable automation ${String(a.id ?? "unknown")}`,
    disable_all_automations: () => "Disable all automations",
    delete_automation: (a) => `Delete automation ${String(a.id ?? "unknown")}?`,
    run_automation_now: (a) => `Run automation ${String(a.id ?? "unknown")} now`,
    create_task: (a) => `Create task "${String(a.title ?? "unknown")}"`,
    update_task: (a) => `Update task ${String(a.id ?? "unknown")}`,
    list_tasks: () => "List your tasks",
    get_task: (a) => `Get task ${String(a.id ?? "unknown")}`,
    complete_task: (a) => `Mark task ${String(a.id ?? "unknown")} completed`,
    cancel_task: (a) => `Cancel task ${String(a.id ?? "unknown")}`,
    delete_task: (a) => `Delete task ${String(a.id ?? "unknown")}?`,
    create_reminder: (a) => `Set reminder "${String(a.title ?? "unknown")}"`,
    update_reminder: (a) => `Update reminder ${String(a.id ?? "unknown")}`,
    list_reminders: () => "List your reminders",
    get_reminder: (a) => `Get reminder ${String(a.id ?? "unknown")}`,
    cancel_reminder: (a) => `Cancel reminder ${String(a.id ?? "unknown")}`,
    delete_reminder: (a) => `Delete reminder ${String(a.id ?? "unknown")}?`,
    create_routine: (a) => `Create routine "${String(a.name ?? "unknown")}"`,
    update_routine: (a) => `Update routine ${String(a.id ?? "unknown")}`,
    list_routines: () => "List your routines",
    get_routine: (a) => `Get routine ${String(a.id ?? "unknown")}`,
    enable_routine: (a) => `Enable routine ${String(a.id ?? "unknown")}`,
    disable_routine: (a) => `Disable routine ${String(a.id ?? "unknown")}`,
    run_routine: (a) => `Run routine ${String(a.id ?? "unknown")} now`,
    delete_routine: (a) => `Delete routine ${String(a.id ?? "unknown")}?`,
    get_daily_briefing: () => "Retrieve the daily briefing",
  };
  return actionMap[toolName]?.(args) ?? description;
}

/**
 * Execute a tool with validation and confirmation gating.
 * Never auto-executes tools that require user confirmation.
 */
export async function executeToolSafely(
  toolName: string,
  args: Record<string, unknown>,
  options: { confirmed?: boolean; registry?: ToolRegistryType } = {},
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const registry = options.registry ?? getToolRegistry();
  const tool = registry.getTool(toolName);

  if (!tool) {
    return { success: false, error: `Tool ${toolName} not found` };
  }

  const validation = ToolInputValidator.validate(args, tool.inputSchema);
  if (!validation.valid) {
    return { success: false, error: `Invalid arguments for ${toolName}: ${validation.error}` };
  }

  if (tool.requiresUserConfirmation && !options.confirmed) {
    return { success: false, error: `Tool ${toolName} requires user confirmation` };
  }

  try {
    const result = await tool.execute(args);
    return { success: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message.slice(0, 500) };
  }
}

// Shared singleton registry with built-in tools registered.
let registryInstance: ToolRegistry | null = null;

/**
 * Get (or lazily create) the shared tool registry.
 */
export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
    for (const tool of getBuiltinTools()) {
      registryInstance.register(tool);
    }
  }
  return registryInstance;
}

/**
 * Reset the shared tool registry (used by tests and hot reloads).
 */
export function resetToolRegistry(): void {
  registryInstance = null;
}
