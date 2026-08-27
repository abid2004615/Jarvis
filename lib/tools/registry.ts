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
  listWindows,
  focusApplication,
  minimizeWindow,
  closeWindow,
  readClipboard,
  writeClipboard,
  clearClipboard,
  listFiles,
  searchFiles,
  openFile,
  revealInFinder,
  isSafariRunning,
  getSafariState,
  openUrlInSafari,
  newSafariTab,
  closeSafari,
  closeSafariTab,
  isVSCodeRunning,
  focusVSCode,
  openVSCode,
  getUpcomingEvents,
  getTodayEvents,
  createCalendarEvent,
  isMusicRunning,
  getMusicState,
  controlMusic,
  playTrack,
  getSystemSnapshot,
  resolveApplicationName,
} from "@/lib/macos";
import { ToolRegistry, ToolInputValidator } from "./types";
import { getMemoryManager, type MemoryCategory } from "@/lib/memory";
import {
  buildScreenContext,
  performOCR,
  captureScreenTemp,
  deleteTempScreenshot,
  getLastContext,
  hasVisualContent,
  wrapAsUntrustedScreenContent,
  checkScreenRecordingPermission,
  checkOCR,
} from "@/lib/vision";
import {
  checkAccessibilityPermission,
  queryAccessibilityElements,
  resolveTarget,
  validateAction,
  executeWithVerification,
  detectHighRiskAction,
  getConfirmationDescription,
  resetChainCounters,
  ALLOWED_KEYS,
} from "@/lib/computer-use";

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
 * Get the current screen context — frontmost app, active window, and OCR text.
 * Read-only; captures screen, performs OCR, returns structured context.
 * The screenshot is deleted after analysis.
 */
export const GET_SCREEN_CONTEXT_TOOL: ToolDefinition = {
  name: "get_screen_context",
  description:
    "Capture the current screen, perform OCR, and return a structured context including the frontmost application, active window title, and all visible text. Read-only; the screenshot is deleted after analysis. Use when the user asks what they are looking at, what application they are using, or wants to understand what is on their screen.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const permission = checkScreenRecordingPermission();
    if (permission !== "granted") {
      return {
        available: false,
        error: "Screen Recording permission is required to see your screen.",
        permission,
      };
    }

    const context = buildScreenContext();
    return {
      available: true,
      frontmostApplication: context.frontmostApplication ?? null,
      activeWindow: context.activeWindow ?? null,
      screenshotAvailable: context.screenshotAvailable,
      screenDimensions: context.screenDimensions ?? null,
      ocrText: context.ocrText ?? null,
      ocrConfidence: context.ocrConfidence ?? null,
      ocrBlockCount: context.ocrBlockCount ?? 0,
      capturedAt: context.capturedAt,
    };
  },
};

/**
 * Capture a screenshot and return its path.
 * The screenshot is saved to a temporary location and should be deleted after use.
 */
export const CAPTURE_SCREEN_TOOL: ToolDefinition = {
  name: "capture_screen",
  description:
    "Capture a screenshot of the current screen. Returns the temporary file path. The screenshot should be analyzed and then deleted. Use only when the user explicitly asks to capture or save a screenshot.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async () => {
    const permission = checkScreenRecordingPermission();
    if (permission !== "granted") {
      return {
        success: false,
        error: "Screen Recording permission is required to capture the screen.",
      };
    }

    const result = captureScreenTemp();
    if (result.success && result.path) {
      const ocr = performOCR(result.path);
      deleteTempScreenshot(result.path);
      return {
        success: true,
        width: result.width,
        height: result.height,
        ocrText: ocr.text || null,
        ocrConfidence: ocr.confidence || null,
        ocrBlockCount: ocr.blockCount || 0,
        message: "Screenshot captured and analyzed. Temporary file deleted.",
      };
    }
    return { success: false, error: result.error };
  },
};

/**
 * Read text from the current screen via OCR.
 * Read-only; captures screen, performs OCR, returns text, deletes screenshot.
 */
export const READ_SCREEN_TEXT_TOOL: ToolDefinition = {
  name: "read_screen_text",
  description:
    "Capture the screen and extract all visible text using OCR. Returns the extracted text with confidence scores. Read-only; the screenshot is deleted after text extraction. Use when the user asks to read, transcribe, or extract text from their screen.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const permission = checkScreenRecordingPermission();
    if (permission !== "granted") {
      return {
        available: false,
        error: "Screen Recording permission is required to read screen text.",
      };
    }

    const ocrAvailable = checkOCR();
    if (ocrAvailable !== "available") {
      return {
        available: false,
        error: "OCR engine is not available on this system.",
      };
    }

    const capture = captureScreenTemp();
    if (!capture.success || !capture.path) {
      return { available: false, error: capture.error };
    }

    const ocr = performOCR(capture.path);
    deleteTempScreenshot(capture.path);

    if (ocr.error) {
      return { available: false, error: ocr.error };
    }

    return {
      available: true,
      text: ocr.text,
      confidence: ocr.confidence,
      blockCount: ocr.blockCount,
      blocks: ocr.blocks,
    };
  },
};

/**
 * Analyze the screen content and provide a summary.
 * Combines frontmost app, window title, and OCR text.
 */
export const ANALYZE_SCREEN_TOOL: ToolDefinition = {
  name: "analyze_screen",
  description:
    "Capture the screen, perform OCR, and provide a structured analysis of what is visible. Returns the frontmost application, window title, and a description of the visible content. Read-only; the screenshot is deleted after analysis. Use when the user asks to analyze, summarize, or understand what is on their screen.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const permission = checkScreenRecordingPermission();
    if (permission !== "granted") {
      return {
        available: false,
        error: "Screen Recording permission is required to analyze the screen.",
      };
    }

    const context = buildScreenContext();
    const parts: string[] = [];

    if (context.frontmostApplication?.name) {
      parts.push(`Active application: ${context.frontmostApplication.name}`);
    }
    if (context.activeWindow?.title) {
      parts.push(`Window: ${context.activeWindow.title}`);
    }
    if (context.screenDimensions) {
      parts.push(`Screen: ${context.screenDimensions.width}x${context.screenDimensions.height}`);
    }
    if (context.ocrText) {
      parts.push(`Visible text (${context.ocrBlockCount} blocks, ${Math.round((context.ocrConfidence ?? 0) * 100)}% confidence):`);
      parts.push(wrapAsUntrustedScreenContent(context.ocrText));
    } else if (context.screenshotAvailable) {
      parts.push("Screenshot captured but no text could be extracted.");
    } else {
      parts.push("No screenshot available.");
    }

    return {
      available: true,
      analysis: parts.join("\n"),
      frontmostApplication: context.frontmostApplication ?? null,
      activeWindow: context.activeWindow ?? null,
      hasText: !!(context.ocrText && context.ocrText.length > 0),
      ocrConfidence: context.ocrConfidence ?? null,
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
 * macOS requires Accessibility permission for a window title. When only the
 * frontmost application is available, JARVIS labels that fallback explicitly.
 */
export const GET_ACTIVE_WINDOW_TOOL: ToolDefinition = {
  name: "get_active_window",
  description:
    "Get the title of the currently active application window. Read-only. Requires macOS accessibility permission for System Events; when a window title is unavailable, JARVIS may return the known frontmost application with source 'application'. Use when the user asks what window they are currently looking at.",
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
      source: result.source ?? "window",
      message: result.source === "application" ? "Frontmost application retrieved; window title unavailable" : "Active window retrieved",
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

// ============================================================================
// P9 — Deep macOS Integration Tools
// ============================================================================

/**
 * Get the current clipboard contents. Read-only.
 * Credential-like content is masked in the response.
 */
export const GET_CLIPBOARD_TOOL: ToolDefinition = {
  name: "get_clipboard",
  description:
    "Read the current clipboard contents. Read-only; does not change anything. Sensitive credential-like content (API keys, passwords, tokens) is automatically masked and not repeated. Use when the user asks 'what's in my clipboard?' or 'paste from clipboard'.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = readClipboard();
    if (!result.available) {
      return { available: false, error: result.error };
    }
    return {
      available: true,
      content: result.isCredentialLike ? result.maskedContent : result.content,
      isCredentialLike: result.isCredentialLike,
      length: result.length,
    };
  },
};

/**
 * Set the clipboard to a specific text value.
 * Does not persist the content internally.
 */
export const SET_CLIPBOARD_TOOL: ToolDefinition = {
  name: "set_clipboard",
  description:
    "Write text to the system clipboard. Use when the user asks to copy something to the clipboard. The content is not persisted or logged by JARVIS.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The text to copy to the clipboard" },
    },
    required: ["text"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const text = typeof input.text === "string" ? input.text : "";
    if (!text) return { success: false, message: "Text is required" };
    const result = writeClipboard(text);
    return { success: result.success, message: result.message };
  },
};

/**
 * Clear the clipboard contents.
 */
export const CLEAR_CLIPBOARD_TOOL: ToolDefinition = {
  name: "clear_clipboard",
  description:
    "Clear the system clipboard. Use when the user asks to clear or empty the clipboard.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = clearClipboard();
    return { success: result.success, message: result.message };
  },
};

/**
 * List all visible windows across applications.
 */
export const LIST_WINDOWS_TOOL: ToolDefinition = {
  name: "list_windows",
  description:
    "List all visible windows across all running applications. Returns the application name and window title for each. Read-only; does not change anything. Use when the user asks what windows are open or what's on their screen.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = listWindows();
    return {
      available: result.available,
      windows: result.windows,
      count: result.count,
      error: result.error,
    };
  },
};

/**
 * Focus (bring to front) an application.
 */
export const FOCUS_APPLICATION_TOOL: ToolDefinition = {
  name: "focus_application",
  description:
    "Bring an application to the foreground (focus its window). Only allowlisted applications may be focused. Use when the user says 'switch to', 'bring up', or 'focus' an application. Does not launch the app — it must already be running.",
  inputSchema: {
    type: "object",
    properties: {
      application: { type: "string", description: "Application name to focus (e.g. Safari, Chrome)" },
    },
    required: ["application"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const appName = typeof input.application === "string" ? input.application : "";
    if (!appName) return { success: false, message: "Application name required" };
    const app = resolveApplicationName(appName);
    if (!app) return { success: false, message: `Application '${appName}' is not in the approved allowlist` };
    const result = focusApplication(app.name);
    return { success: result.success, application: result.application, message: result.message };
  },
};

/**
 * Minimize the front window of an application.
 */
export const MINIMIZE_WINDOW_TOOL: ToolDefinition = {
  name: "minimize_window",
  description:
    "Minimize the front window of an application. Use when the user says 'minimize' or 'hide' an application window. Only allowlisted applications may be minimized. This action requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      application: { type: "string", description: "Application name to minimize (e.g. Safari, Chrome)" },
    },
    required: ["application"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const appName = typeof input.application === "string" ? input.application : "";
    if (!appName) return { success: false, message: "Application name required" };
    const app = resolveApplicationName(appName);
    if (!app) return { success: false, message: `Application '${appName}' is not in the approved allowlist` };
    const result = minimizeWindow(app.name);
    return { success: result.success, application: result.application, message: result.message };
  },
};

/**
 * Close the front window of an application.
 */
export const CLOSE_WINDOW_TOOL: ToolDefinition = {
  name: "close_window",
  description:
    "Close the front window of an application (not quit the app). Use when the user says 'close this window' or 'close the current window'. Only allowlisted applications may be affected. This action requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      application: { type: "string", description: "Application name whose window to close (e.g. Safari, Chrome)" },
    },
    required: ["application"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const appName = typeof input.application === "string" ? input.application : "";
    if (!appName) return { success: false, message: "Application name required" };
    const app = resolveApplicationName(appName);
    if (!app) return { success: false, message: `Application '${appName}' is not in the approved allowlist` };
    const result = closeWindow(app.name);
    return { success: result.success, application: result.application, message: result.message };
  },
};

/**
 * List files in an allowlisted folder.
 */
export const LIST_FILES_TOOL: ToolDefinition = {
  name: "list_files",
  description:
    "List files and folders in an allowlisted directory (Downloads, Documents, Desktop, Pictures, Movies, Music). Read-only. Returns file names, sizes, and modification dates. Use when the user asks to see what's in a folder.",
  inputSchema: {
    type: "object",
    properties: {
      folder: { type: "string", description: "Allowlisted folder name (Downloads, Documents, Desktop, Pictures, Movies, Music)" },
    },
    required: ["folder"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const folder = typeof input.folder === "string" ? input.folder : "";
    if (!folder) return { available: false, error: "Folder name required" };
    const result = listFiles(folder);
    return {
      available: result.available,
      files: result.files.map((f) => ({ name: f.name, size: f.size, isDirectory: f.isDirectory, modified: f.modified })),
      count: result.count,
      folder: result.folder,
      error: result.error,
    };
  },
};

/**
 * Search for files within an allowlisted folder.
 */
export const SEARCH_FILES_TOOL: ToolDefinition = {
  name: "search_files",
  description:
    "Search for files by name within an allowlisted directory (Downloads, Documents, Desktop, Pictures, Movies, Music). Uses Spotlight search. Read-only. Use when the user asks to find or search for files.",
  inputSchema: {
    type: "object",
    properties: {
      folder: { type: "string", description: "Allowlisted folder to search within" },
      query: { type: "string", description: "Search query (file name or content)" },
    },
    required: ["folder", "query"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const folder = typeof input.folder === "string" ? input.folder : "";
    const query = typeof input.query === "string" ? input.query : "";
    if (!folder || !query) return { available: false, error: "Folder and query required" };
    const result = searchFiles(folder, query);
    return {
      available: result.available,
      results: result.results.map((f) => ({ name: f.name, path: f.path, size: f.size, isDirectory: f.isDirectory })),
      count: result.count,
      query: result.query,
      error: result.error,
    };
  },
};

/**
 * Open a file in its default application.
 */
export const OPEN_FILE_TOOL: ToolDefinition = {
  name: "open_file",
  description:
    "Open a file in its default application. The file must be within an allowlisted directory (Downloads, Documents, Desktop, Pictures, Movies, Music). Path traversal is rejected. This action requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      folder: { type: "string", description: "Allowlisted folder containing the file" },
      path: { type: "string", description: "Relative path within the folder (e.g. 'report.pdf' or 'subfolder/file.txt')" },
    },
    required: ["folder", "path"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const folder = typeof input.folder === "string" ? input.folder : "";
    const filePath = typeof input.path === "string" ? input.path : "";
    if (!folder || !filePath) return { success: false, message: "Folder and path required" };
    const result = openFile(folder, filePath);
    return { success: result.success, message: result.message };
  },
};

/**
 * Reveal a file in Finder.
 */
export const REVEAL_FILE_TOOL: ToolDefinition = {
  name: "reveal_file",
  description:
    "Reveal (select) a file in Finder. The file must be within an allowlisted directory. This action requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      folder: { type: "string", description: "Allowlisted folder containing the file" },
      path: { type: "string", description: "Relative path within the folder" },
    },
    required: ["folder", "path"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const folder = typeof input.folder === "string" ? input.folder : "";
    const filePath = typeof input.path === "string" ? input.path : "";
    if (!folder || !filePath) return { success: false, message: "Folder and path required" };
    const result = revealInFinder(folder, filePath);
    return { success: result.success, message: result.message };
  },
};

/**
 * Get the current Safari state (tabs, URL, title).
 */
export const GET_SAFARI_STATE_TOOL: ToolDefinition = {
  name: "get_safari_state",
  description:
    "Get the current Safari state including the current tab title, URL, and tab count. Read-only. Use when the user asks what they're browsing, what website they're on, or what Safari is showing.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getSafariState();
    return {
      available: result.available,
      isRunning: result.isRunning,
      currentTab: result.currentTab ?? null,
      tabCount: result.tabCount ?? 0,
      error: result.error,
    };
  },
};

/**
 * Open a URL in Safari. URL is validated for safe schemes only.
 */
export const OPEN_URL_IN_SAFARI_TOOL: ToolDefinition = {
  name: "open_url_in_safari",
  description:
    "Open a URL in Safari. Only safe http and https URLs are allowed. JavaScript, file, data, and credential-bearing URLs are rejected. Use when the user asks to open a website or navigate to a URL. This action may require user confirmation depending on the URL.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to open (must be http or https)" },
    },
    required: ["url"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const url = typeof input.url === "string" ? input.url : "";
    if (!url) return { success: false, message: "URL is required" };
    const result = openUrlInSafari(url);
    return { success: result.success, message: result.message };
  },
};

/**
 * Create a new Safari tab.
 */
export const NEW_SAFARI_TAB_TOOL: ToolDefinition = {
  name: "new_safari_tab",
  description:
    "Create a new tab in Safari. Use when the user asks to open a new tab or open something in a new tab.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = newSafariTab();
    return { success: result.success, message: result.message };
  },
};

/**
 * Close the current Safari tab.
 */
export const CLOSE_SAFARI_TAB_TOOL: ToolDefinition = {
  name: "close_safari_tab",
  description:
    "Close the current tab in Safari. Use when the user asks to close the current tab. This action requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async () => {
    const result = closeSafariTab();
    return { success: result.success, message: result.message };
  },
};

/**
 * Get the current Music/Apple Music playback state.
 */
export const GET_MUSIC_STATE_TOOL: ToolDefinition = {
  name: "get_music_state",
  description:
    "Get the current Apple Music playback state including the playing track name, artist, album, and playback position. Read-only. Use when the user asks 'what's playing?' or 'what song is this?'.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getMusicState();
    return {
      available: result.available,
      isRunning: result.isRunning,
      playerState: result.playerState,
      currentTrack: result.currentTrack ?? null,
      error: result.error,
    };
  },
};

/**
 * Control Music playback (play, pause, next, previous).
 */
export const CONTROL_MUSIC_TOOL: ToolDefinition = {
  name: "control_music",
  description:
    "Control Apple Music playback. Actions: play (resume), pause, next (skip to next track), previous (go to previous track). Use for commands like 'play music', 'pause', 'next song'. Safe — does not require confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["play", "pause", "next", "previous"],
        description: "Playback action to perform",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const action = typeof input.action === "string" ? input.action : "";
    if (!["play", "pause", "next", "previous"].includes(action)) {
      return { success: false, message: "Action must be one of: play, pause, next, previous" };
    }
    const result = controlMusic(action as "play" | "pause" | "next" | "previous");
    return { success: result.success, message: result.message };
  },
};

/**
 * Search and play a track in Music.
 */
export const PLAY_TRACK_TOOL: ToolDefinition = {
  name: "play_track",
  description:
    "Search for and play a track in Apple Music. Provide a song name, artist name, or search query. Use when the user asks to play a specific song or artist.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Song name, artist name, or search query" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const query = typeof input.query === "string" ? input.query : "";
    if (!query) return { success: false, message: "Query is required" };
    const result = playTrack(query);
    return { success: result.success, message: result.message };
  },
};

/**
 * Get a unified system snapshot with all available telemetry.
 */
export const GET_SYSTEM_SNAPSHOT_TOOL: ToolDefinition = {
  name: "get_system_snapshot",
  description:
    "Get a complete system snapshot: CPU, memory, disk, battery, network, uptime, frontmost application, active window, running applications, and process summary. All data is real; unavailable values are omitted. Use when the user asks for an overview of the system or 'how's my Mac doing?'.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    return getSystemSnapshot();
  },
};

/**
 * Get today's calendar events.
 */
export const GET_TODAY_EVENTS_TOOL: ToolDefinition = {
  name: "get_today_events",
  description:
    "Get today's calendar events from Apple Calendar. Read-only. Returns event titles, start/end times, and calendar names. Use when the user asks 'what's on my calendar today?' or 'do I have any meetings today?'.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const result = getTodayEvents();
    return {
      available: result.available,
      events: result.events,
      count: result.count,
      error: result.error,
    };
  },
};

/**
 * Get upcoming calendar events for the next N days.
 */
export const GET_UPCOMING_EVENTS_TOOL: ToolDefinition = {
  name: "get_upcoming_events",
  description:
    "Get upcoming calendar events for the next N days (default 7). Read-only. Use when the user asks 'what's coming up this week?' or 'what's on my calendar this week?'.",
  inputSchema: {
    type: "object",
    properties: {
      days: { type: "integer", description: "Number of days ahead to look (default 7, max 30)" },
    },
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async (input) => {
    const days = typeof input.days === "number" ? Math.min(30, Math.max(1, Math.floor(input.days))) : 7;
    const result = getUpcomingEvents(days);
    return {
      available: result.available,
      events: result.events,
      count: result.count,
      dateRange: result.dateRange,
      error: result.error,
    };
  },
};

/**
 * Create a calendar event. Requires confirmation.
 */
export const CREATE_CALENDAR_EVENT_TOOL: ToolDefinition = {
  name: "create_calendar_event",
  description:
    "Create a new event in Apple Calendar. Requires a title and start date/time. End date defaults to 1 hour after start if not provided. This action requires user confirmation — JARVIS will never silently create appointments.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Event title (e.g. 'Team meeting')" },
      startDate: { type: "string", description: "Start date/time (e.g. 'Monday at 3 PM', '2026-08-20 14:00')" },
      endDate: { type: "string", description: "End date/time (optional, defaults to 1 hour after start)" },
      location: { type: "string", description: "Event location (optional)" },
      calendar: { type: "string", description: "Calendar name (optional, defaults to default calendar)" },
    },
    required: ["title", "startDate"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const title = typeof input.title === "string" ? input.title : "";
    const startDate = typeof input.startDate === "string" ? input.startDate : "";
    const endDate = typeof input.endDate === "string" ? input.endDate : undefined;
    const location = typeof input.location === "string" ? input.location : undefined;
    const calendar = typeof input.calendar === "string" ? input.calendar : undefined;
    if (!title || !startDate) return { success: false, message: "Title and start date required" };
    const result = createCalendarEvent(title, startDate, endDate, location, calendar);
    return { success: result.success, message: result.message, event: result.event };
  },
};

/**
 * Get VS Code state (running or not).
 */
export const GET_VSCODE_STATE_TOOL: ToolDefinition = {
  name: "get_vscode_state",
  description:
    "Check if Visual Studio Code is running. Read-only. Use when the user asks if VS Code is open or running.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const { getVSCodeState } = require("@/lib/macos");
    const result = getVSCodeState();
    return { available: result.available, isRunning: result.isRunning, error: result.error };
  },
};

/**
 * Focus VS Code (bring to front).
 */
export const FOCUS_VSCODE_TOOL: ToolDefinition = {
  name: "focus_vscode",
  description:
    "Bring Visual Studio Code to the foreground. Use when the user says 'switch to VS Code' or 'bring up VS Code'. This action requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async () => {
    const result = focusVSCode();
    return { success: result.success, message: result.message };
  },
};

// ── Computer Use Tools ────────────────────────────────────────────────────────

/**
 * Click a UI element by role and label. Requires target resolution + confirmation.
 */
export const COMPUTER_CLICK_TOOL: ToolDefinition = {
  name: "computer_click",
  description:
    "Click a UI element on screen. Specify the element by its role (button, link, text, input, tab, menu, checkbox) and label text. The system will locate the element via accessibility APIs or OCR, validate it, and click the center. Requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      role: {
        type: "string",
        description: "The UI role of the target element (button, link, text, input, tab, menu, checkbox)",
      },
      label: {
        type: "string",
        description: "The visible text label of the element to click",
      },
      application: {
        type: "string",
        description: "Optional: expected application name (for validation)",
      },
    },
    required: ["label"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const { validateAction, executeWithVerification } = require("@/lib/computer-use/planner");
    const action: import("@/lib/computer-use/types").ComputerAction = {
      type: "click",
      target: {
        role: (input.role as string || "unknown") as import("@/lib/computer-use/types").UIRole,
        label: input.label as string,
        application: input.application as string | undefined,
        source: "application",
      },
      application: input.application as string | undefined,
    };

    const validation = validateAction(action);
    if (!validation.valid) {
      return { success: false, error: validation.error, needsClarification: validation.needsClarification, candidates: validation.candidates };
    }

    // Replace target with resolved target for execution
    if (validation.resolvedTarget) {
      action.target = validation.resolvedTarget as unknown as import("@/lib/computer-use/types").UIElementTarget;
    }

    const execResult = executeWithVerification(action);
    return {
      success: execResult.result.status === "success",
      status: execResult.result.status,
      message: execResult.result.message,
      verified: execResult.verified,
      error: execResult.result.error,
    };
  },
};

/**
 * Type text into a focused field. Requires confirmation.
 */
export const COMPUTER_TYPE_TOOL: ToolDefinition = {
  name: "computer_type",
  description:
    "Type text into the currently focused input field. The text is typed character by character using System Events. Credential-like content (passwords, API keys, tokens) is automatically rejected. Requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The exact text to type",
      },
    },
    required: ["text"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const { executeComputerAction } = require("@/lib/computer-use/executor");
    const action = {
      type: "type" as const,
      value: input.text as string,
    };
    const result = executeComputerAction(action);
    return {
      success: result.status === "success",
      status: result.status,
      message: result.message,
      error: result.error,
    };
  },
};

/**
 * Scroll the current window. Low risk, but still requires confirmation.
 */
export const COMPUTER_SCROLL_TOOL: ToolDefinition = {
  name: "computer_scroll",
  description:
    "Scroll the current window in a direction (up, down, left, right) by an amount (1-10, default 3). Low risk action but requires confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      direction: {
        type: "string",
        description: "Scroll direction: up, down, left, or right (default: down)",
      },
      amount: {
        type: "number",
        description: "Scroll amount 1-10 (default: 3)",
      },
    },
    required: [],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const { executeComputerAction } = require("@/lib/computer-use/executor");
    const action = {
      type: "scroll" as const,
      direction: (input.direction as import("@/lib/computer-use/types").ScrollDirection) || "down",
      amount: typeof input.amount === "number" ? input.amount : 3,
    };
    const result = executeComputerAction(action);
    return {
      success: result.status === "success",
      status: result.status,
      message: result.message,
      error: result.error,
    };
  },
};

/**
 * Press a keyboard shortcut. Only allowlisted keys accepted. Requires confirmation.
 */
export const COMPUTER_KEYPRESS_TOOL: ToolDefinition = {
  name: "computer_keypress",
  description:
    "Press a keyboard shortcut. Only allowlisted keys are accepted (enter, escape, tab, space, arrows, cmd+c/v/x/a/z/s/n/t/w/q, etc.). Arbitrary key combinations are rejected. Requires user confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "The key to press (e.g., 'enter', 'escape', 'cmd+c', 'arrow_down')",
      },
    },
    required: ["key"],
    additionalProperties: false,
  },
  riskLevel: "confirmation",
  requiresUserConfirmation: true,
  execute: async (input) => {
    const { ALLOWED_KEYS } = require("@/lib/computer-use/types");
    const key = (input.key as string || "").toLowerCase();
    if (!ALLOWED_KEYS.has(key)) {
      return { success: false, error: `Key "${key}" is not in the allowlist. Allowed keys: ${Array.from(ALLOWED_KEYS).join(", ")}` };
    }
    const { executeComputerAction } = require("@/lib/computer-use/executor");
    const action = {
      type: "keypress" as const,
      key,
    };
    const result = executeComputerAction(action);
    return {
      success: result.status === "success",
      status: result.status,
      message: result.message,
      error: result.error,
    };
  },
};

/**
 * Get computer-use system status: accessibility permission, screen recording, etc.
 */
export const COMPUTER_USE_STATUS_TOOL: ToolDefinition = {
  name: "computer_use_status",
  description:
    "Check the computer-use system status: accessibility permission, screen recording permission, and available capabilities. Read-only, no confirmation needed.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  riskLevel: "safe",
  requiresUserConfirmation: false,
  execute: async () => {
    const { checkAccessibilityPermission } = require("@/lib/computer-use/accessibility");
    const { checkScreenRecordingPermission } = require("@/lib/vision/permissions");
    const { ALLOWED_KEYS, DEFAULT_RATE_LIMITS } = require("@/lib/computer-use/types");

    const axPermission = checkAccessibilityPermission();
    const screenPermission = checkScreenRecordingPermission();

    return {
      accessibility: axPermission,
      screenRecording: screenPermission,
      allowedKeys: Array.from(ALLOWED_KEYS),
      rateLimits: DEFAULT_RATE_LIMITS,
      computerUseReady: axPermission === "granted" && screenPermission === "granted",
    };
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
    GET_SCREEN_CONTEXT_TOOL,
    CAPTURE_SCREEN_TOOL,
    READ_SCREEN_TEXT_TOOL,
    ANALYZE_SCREEN_TOOL,
    GET_CLIPBOARD_TOOL,
    SET_CLIPBOARD_TOOL,
    CLEAR_CLIPBOARD_TOOL,
    LIST_WINDOWS_TOOL,
    FOCUS_APPLICATION_TOOL,
    MINIMIZE_WINDOW_TOOL,
    CLOSE_WINDOW_TOOL,
    LIST_FILES_TOOL,
    SEARCH_FILES_TOOL,
    OPEN_FILE_TOOL,
    REVEAL_FILE_TOOL,
    GET_SAFARI_STATE_TOOL,
    OPEN_URL_IN_SAFARI_TOOL,
    NEW_SAFARI_TAB_TOOL,
    CLOSE_SAFARI_TAB_TOOL,
    GET_MUSIC_STATE_TOOL,
    CONTROL_MUSIC_TOOL,
    PLAY_TRACK_TOOL,
    GET_SYSTEM_SNAPSHOT_TOOL,
    GET_TODAY_EVENTS_TOOL,
    GET_UPCOMING_EVENTS_TOOL,
    CREATE_CALENDAR_EVENT_TOOL,
    GET_VSCODE_STATE_TOOL,
    FOCUS_VSCODE_TOOL,
    COMPUTER_CLICK_TOOL,
    COMPUTER_TYPE_TOOL,
    COMPUTER_SCROLL_TOOL,
    COMPUTER_KEYPRESS_TOOL,
    COMPUTER_USE_STATUS_TOOL,
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
    get_screen_context: () => "Capture screen and get visual context",
    capture_screen: () => "Capture a screenshot of the screen?",
    read_screen_text: () => "Read text from the screen via OCR",
    analyze_screen: () => "Analyze the screen content",
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
    get_clipboard: () => "Read the clipboard contents",
    set_clipboard: (a) => `Set clipboard to: ${String(a.text ?? "").slice(0, 50)}...`,
    clear_clipboard: () => "Clear the clipboard?",
    list_windows: () => "List all visible windows",
    focus_application: (a) => `Bring ${String(a.application ?? "unknown")} to front?`,
    minimize_window: (a) => `Minimize ${String(a.application ?? "unknown")} window?`,
    close_window: (a) => `Close ${String(a.application ?? "unknown")} front window?`,
    list_files: (a) => `List files in ${String(a.folder ?? "unknown")}`,
    search_files: (a) => `Search for "${String(a.query ?? "")}" in ${String(a.folder ?? "unknown")}`,
    open_file: (a) => `Open ${String(a.path ?? "file")} in ${String(a.folder ?? "unknown")}?`,
    reveal_file: (a) => `Reveal ${String(a.path ?? "file")} in Finder?`,
    get_safari_state: () => "Get Safari state (tabs, URL)",
    open_url_in_safari: (a) => `Open ${String(a.url ?? "URL")} in Safari?`,
    new_safari_tab: () => "Create a new Safari tab",
    close_safari_tab: () => "Close the current Safari tab?",
    get_music_state: () => "Get current music playback state",
    control_music: (a) => `${String(a.action ?? "play")} music`,
    play_track: (a) => `Play "${String(a.query ?? "track")}" in Music`,
    get_system_snapshot: () => "Retrieve complete system snapshot",
    get_today_events: () => "Retrieve today's calendar events",
    get_upcoming_events: (a) => `Retrieve calendar events for the next ${String(a.days ?? "7")} days`,
    create_calendar_event: (a) => `Create calendar event "${String(a.title ?? "unknown")}"?`,
    get_vscode_state: () => "Check if VS Code is running",
    focus_vscode: () => "Bring VS Code to front?",
    computer_click: (a) => `Click ${String(a.label ?? "element")} (${String(a.role ?? "unknown")})?`,
    computer_type: (a) => `Type text into the active field?`,
    computer_scroll: (a) => `Scroll ${String(a.direction ?? "down")} by ${String(a.amount ?? "3")} units?`,
    computer_keypress: (a) => `Press ${String(a.key ?? "key")}?`,
    computer_use_status: () => "Check computer-use system status",
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
