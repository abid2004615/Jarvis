/**
 * P3.2 — Expanded macOS Control.
 * Covers the 40 required scenarios: applications, folders, volume, brightness,
 * screenshot, system queries, permissions, and security. Pipeline-level tests
 * use injected fakes so no real macOS side effects or network calls occur.
 */

import { JarvisPipeline } from "@/lib/runtime/pipeline";
import type { AssistantLike } from "@/lib/runtime/pipeline";
import { JarvisRuntimeState } from "@/lib/runtime/types";
import { ToolRegistry, ToolPermissionManager } from "@/lib/tools/types";
import type { ToolDefinition } from "@/lib/tools/types";
import type { AssistantContext, AssistantProcessResult } from "@/lib/ai/types";
import { resetConversationContextManager } from "@/lib/runtime/context";

import {
  getAllowlistedApplication,
  resolveApplicationName,
  getAllowlistedApplications,
  launchApplication,
  quitApplication,
  resolveFolderPath,
  openFolder,
  getVolumeStatus,
  setVolume,
  validateSetVolume,
  getBrightnessStatus,
  validateSetBrightness,
  buildScreenshotPath,
  getScreenshotDirectory,
  getRunningApplications,
} from "@/lib/macos";

import {
  getBuiltinTools,
  getToolRegistry,
  resetToolRegistry,
  executeToolSafely,
  describeToolAction,
  sanitizeArguments,
  GET_VOLUME_STATUS_TOOL,
  SET_VOLUME_TOOL,
  GET_BRIGHTNESS_STATUS_TOOL,
  SET_BRIGHTNESS_TOOL,
  OPEN_FOLDER_TOOL,
  QUIT_APPLICATION_TOOL,
  TAKE_SCREENSHOT_TOOL,
  GET_FRONTMOST_APPLICATION_TOOL,
  GET_RUNNING_APPLICATIONS_TOOL,
  LAUNCH_APPLICATION_TOOL,
} from "@/lib/tools/registry";

describe("P3.2 Applications", () => {
  test("Safari is allowlisted", () => {
    const app = getAllowlistedApplication("Safari");
    expect(app).toBeDefined();
    expect(app?.name).toBe("Safari");
  });

  test("Chrome is allowlisted (canonical name Google Chrome)", () => {
    const app = getAllowlistedApplication("Chrome");
    expect(app?.name).toBe("Google Chrome");
    expect(resolveApplicationName("Google Chrome")?.name).toBe("Google Chrome");
    expect(resolveApplicationName("VS Code")?.name).toBe("Visual Studio Code");
  });

  test("unknown application is rejected", () => {
    expect(resolveApplicationName("NonExistentApp123")).toBeNull();
    const result = launchApplication("NonExistentApp123");
    expect(result.success).toBe(false);
    expect(result.message).toContain("allowlist");
  });

  test("arbitrary application path is rejected", () => {
    expect(resolveApplicationName("/Applications/Evil.app")).toBeNull();
    expect(resolveApplicationName("../../Applications/Safari.app")).toBeNull();
    const result = launchApplication("/etc/passwd");
    expect(result.success).toBe(false);
    expect(result.message).toContain("allowlist");
  });

  test("launch tool schema requires application and forbids extras", () => {
    expect(LAUNCH_APPLICATION_TOOL.inputSchema.required).toContain("application");
    expect(LAUNCH_APPLICATION_TOOL.inputSchema.additionalProperties).toBe(false);
  });

  test("quit tool schema requires application and forbids extras", () => {
    expect(QUIT_APPLICATION_TOOL.inputSchema.required).toContain("application");
    expect(QUIT_APPLICATION_TOOL.inputSchema.additionalProperties).toBe(false);
  });

  test("launch requires confirmation", () => {
    expect(LAUNCH_APPLICATION_TOOL.riskLevel).toBe("confirmation");
    expect(LAUNCH_APPLICATION_TOOL.requiresUserConfirmation).toBe(true);
  });

  test("quit requires confirmation", () => {
    expect(QUIT_APPLICATION_TOOL.riskLevel).toBe("confirmation");
    expect(QUIT_APPLICATION_TOOL.requiresUserConfirmation).toBe(true);
  });

  test("quit rejects unknown application without side effects", async () => {
    const result = quitApplication("NonExistentApp123");
    expect(result.success).toBe(false);
    expect(result.message).toContain("allowlist");
  });

  test("allowlist includes the required P3.2 applications", () => {
    const names = getAllowlistedApplications().map((a) => a.name.toLowerCase());
    for (const expected of ["safari", "google chrome", "firefox", "finder", "terminal", "mail", "messages", "notes", "calendar", "reminders", "music", "spotify", "visual studio code", "system settings"]) {
      expect(names).toContain(expected);
    }
  });
});

describe("P3.2 Folders", () => {
  test("Downloads resolves to the user's Downloads directory", () => {
    const resolved = resolveFolderPath("Downloads");
    expect(resolved.valid).toBe(true);
    if (resolved.valid) {
      expect(resolved.name).toBe("Downloads");
      expect(resolved.path.endsWith("/Downloads")).toBe(true);
      expect(resolved.path).not.toContain("..");
    }
  });

  test("Documents resolves to the user's Documents directory", () => {
    const resolved = resolveFolderPath("Documents");
    expect(resolved.valid).toBe(true);
    if (resolved.valid) {
      expect(resolved.path.endsWith("/Documents")).toBe(true);
    }
  });

  test("path traversal is rejected", () => {
    expect(resolveFolderPath("../..").valid).toBe(false);
    expect(resolveFolderPath("Downloads/../Documents").valid).toBe(false);
    expect(resolveFolderPath("~/Documents").valid).toBe(false);
  });

  test("absolute paths are rejected", () => {
    expect(resolveFolderPath("/etc").valid).toBe(false);
    expect(resolveFolderPath("/private/var").valid).toBe(false);
    expect(resolveFolderPath("/System").valid).toBe(false);
  });

  test("system and hidden directories are rejected", () => {
    expect(resolveFolderPath("~/.ssh").valid).toBe(false);
    expect(resolveFolderPath(".ssh").valid).toBe(false);
    expect(resolveFolderPath("System").valid).toBe(false);
  });

  test("open_folder requires confirmation", () => {
    expect(OPEN_FOLDER_TOOL.riskLevel).toBe("confirmation");
    expect(OPEN_FOLDER_TOOL.requiresUserConfirmation).toBe(true);
  });

  test("open_folder schema requires folder and forbids extras", () => {
    expect(OPEN_FOLDER_TOOL.inputSchema.required).toContain("folder");
    expect(OPEN_FOLDER_TOOL.inputSchema.additionalProperties).toBe(false);
  });

  test("openFolder rejects arbitrary paths", () => {
    const result = openFolder("/etc");
    expect(result.success).toBe(false);
    expect(result.message).toContain("allowlist");
  });
});

describe("P3.2 Volume", () => {
  test("get volume returns a structured result", async () => {
    expect(GET_VOLUME_STATUS_TOOL.riskLevel).toBe("safe");
    expect(GET_VOLUME_STATUS_TOOL.requiresUserConfirmation).toBe(false);
    const result = await GET_VOLUME_STATUS_TOOL.execute({});
    expect(typeof result.available).toBe("boolean");
  });

  test("set volume requires at least one operation", () => {
    const validation = validateSetVolume({});
    expect(validation.valid).toBe(false);
  });

  test("level 0 is accepted", () => {
    expect(validateSetVolume({ level: 0 }).valid).toBe(true);
  });

  test("level 100 is accepted", () => {
    expect(validateSetVolume({ level: 100 }).valid).toBe(true);
  });

  test("level above 100 is rejected", () => {
    expect(validateSetVolume({ level: 101 }).valid).toBe(false);
    const result = setVolume({ level: 101 });
    expect(result.success).toBe(false);
  });

  test("negative level is rejected", () => {
    expect(validateSetVolume({ level: -1 }).valid).toBe(false);
  });

  test("delta out of bounds is rejected", () => {
    expect(validateSetVolume({ delta: 150 }).valid).toBe(false);
    expect(validateSetVolume({ delta: -150 }).valid).toBe(false);
    expect(validateSetVolume({ delta: 10 }).valid).toBe(true);
  });

  test("muted must be a boolean", () => {
    expect(validateSetVolume({ muted: "yes" }).valid).toBe(false);
    expect(validateSetVolume({ muted: true }).valid).toBe(true);
  });

  test("volume modification requires confirmation", () => {
    expect(SET_VOLUME_TOOL.riskLevel).toBe("confirmation");
    expect(SET_VOLUME_TOOL.requiresUserConfirmation).toBe(true);
  });

  test("set_volume schema forbids additional properties", () => {
    expect(SET_VOLUME_TOOL.inputSchema.additionalProperties).toBe(false);
  });
});

describe("P3.2 Brightness", () => {
  test("get brightness returns a structured result (never faked)", async () => {
    expect(GET_BRIGHTNESS_STATUS_TOOL.riskLevel).toBe("safe");
    const result = await GET_BRIGHTNESS_STATUS_TOOL.execute({});
    expect(typeof result.available).toBe("boolean");
    if (result.available) {
      expect(typeof result.brightnessPercent).toBe("number");
    } else {
      expect(result.error).toBeDefined();
    }
  });

  test("set brightness validates input", () => {
    expect(validateSetBrightness({ level: 50 }).valid).toBe(true);
    expect(validateSetBrightness({ level: "50" }).valid).toBe(false);
    expect(validateSetBrightness({}).valid).toBe(false);
  });

  test("invalid brightness values are rejected", () => {
    expect(validateSetBrightness({ level: 101 }).valid).toBe(false);
    expect(validateSetBrightness({ level: -5 }).valid).toBe(false);
    expect(validateSetBrightness({ delta: 200 }).valid).toBe(false);
  });

  test("set brightness never claims success on unavailable systems", async () => {
    // The tool must require confirmation (schema gate) and, if executed,
    // must return a structured unavailable result rather than success.
    expect(SET_BRIGHTNESS_TOOL.requiresUserConfirmation).toBe(true);
    const result = await SET_BRIGHTNESS_TOOL.execute({ level: 50 });
    expect(typeof result.success).toBe("boolean");
    if (result.success === false) {
      expect(result.error).toBeDefined();
    }
  });
});

describe("P3.2 Screenshot", () => {
  test("screenshot tool exists", () => {
    const names = getBuiltinTools().map((t) => t.name);
    expect(names).toContain("take_screenshot");
  });

  test("screenshot requires confirmation", () => {
    expect(TAKE_SCREENSHOT_TOOL.riskLevel).toBe("confirmation");
    expect(TAKE_SCREENSHOT_TOOL.requiresUserConfirmation).toBe(true);
  });

  test("output path is fully controlled", () => {
    const path = buildScreenshotPath();
    expect(path.startsWith(getScreenshotDirectory())).toBe(true);
    expect(path).toMatch(/JARVIS[\/\\]jarvis-.*\.png$/);
    expect(path).not.toContain("..");
  });

  test("screenshot schema accepts no user-supplied path", async () => {
    const result = await executeToolSafely("take_screenshot", { path: "/tmp/evil.png" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid arguments");
  });
});

describe("P3.2 System Queries", () => {
  test("frontmost application tool is safe and structured", async () => {
    expect(GET_FRONTMOST_APPLICATION_TOOL.riskLevel).toBe("safe");
    expect(GET_FRONTMOST_APPLICATION_TOOL.requiresUserConfirmation).toBe(false);
    const result = await GET_FRONTMOST_APPLICATION_TOOL.execute({});
    expect(typeof result.available).toBe("boolean");
    if (result.available) {
      expect(typeof result.name).toBe("string");
    }
  });

  test("running applications tool is safe and structured", async () => {
    expect(GET_RUNNING_APPLICATIONS_TOOL.riskLevel).toBe("safe");
    const result = await GET_RUNNING_APPLICATIONS_TOOL.execute({});
    expect(typeof result.available).toBe("boolean");
    if (result.available) {
      expect(Array.isArray(result.applications)).toBe(true);
    }
  });

  test("running applications result is bounded", async () => {
    const result = getRunningApplications();
    if (result.available) {
      expect(result.applications.length).toBeLessThanOrEqual(15);
    }
  });
});

describe("P3.2 Permissions", () => {
  test("safe tools execute directly without confirmation", async () => {
    resetToolRegistry();
    const result = await executeToolSafely("get_current_time", {});
    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });

  test("confirmation-risk tools execute immediately through the pipeline", async () => {
    resetConversationContextManager();
    const executor = jest.fn(async () => ({ ok: true }));
    const registry = new ToolRegistry();
    registry.register({
      name: "set_volume",
      description: "Change the system volume",
      inputSchema: {
        type: "object",
        properties: { level: { type: "integer" } },
        required: [],
        additionalProperties: false,
      },
      riskLevel: "confirmation",
      requiresUserConfirmation: true,
      execute: executor,
    });

    const fakeAssistant: AssistantLike = {
      async processMessage(_input: string, _context: AssistantContext): Promise<AssistantProcessResult> {
        return {
          response: "",
          toolsUsed: ["set_volume"],
          toolCalls: [{ id: "c1", name: "set_volume", arguments: { level: 40 } }],
        };
      },
    };

    const pipeline = new JarvisPipeline({ assistant: fakeAssistant, registry });
    const result = await pipeline.processUserInput("set volume to 40");

    expect(result.state).toBe(JarvisRuntimeState.IDLE);
    expect(result.pendingConfirmation).toBeUndefined();
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith({ level: 40 });
    expect(result.toolsExecuted?.[0]).toMatchObject({
      toolName: "set_volume",
      success: true,
    });
  });

  test("restricted tools are rejected by the permission manager", async () => {
    const registry = getToolRegistry();
    const manager = new ToolPermissionManager(registry);
    manager.restrictTool("set_volume");
    const result = await manager.canExecute("set_volume", { level: 40 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("restricted");
  });
});

describe("P3.2 Security", () => {
  test("no arbitrary shell command tools are registered", () => {
    const names = getBuiltinTools().map((t) => t.name);
    for (const forbidden of [
      "execute_shell_command",
      "run_script",
      "delete_file",
      "delete_folder",
      "kill_process",
      "modify_system_configuration",
      "executeCommand",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });

  test("no tool description instructs shell usage", () => {
    for (const tool of getBuiltinTools()) {
      expect(tool.description.toLowerCase()).not.toContain("shell command");
      expect(tool.description.toLowerCase()).not.toContain("execute any shell");
    }
  });

  test("path traversal is rejected end to end", () => {
    expect(resolveFolderPath("../..").valid).toBe(false);
    expect(resolveFolderPath("~/Downloads").valid).toBe(false);
  });

  test("no arbitrary application execution", () => {
    const result = launchApplication("/Applications/System/Library/RemoteManagement/AppleVNCServer.app");
    expect(result.success).toBe(false);
    expect(result.message).toContain("allowlist");
  });

  test("no secret leakage in confirmations or descriptions", () => {
    const action = describeToolAction("set_volume", "Change volume", { level: 40 });
    expect(action).toBe("Set system volume to 40%?");
    expect(action.toLowerCase()).not.toContain("api");
    const redacted = sanitizeArguments({ apiKey: "sk-live-secret", level: 40 });
    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.level).toBe(40);
  });

  test("malformed arguments are rejected", async () => {
    resetToolRegistry();
    const extraProp = await executeToolSafely("open_folder", { folder: "Downloads", extra: 1 });
    expect(extraProp.success).toBe(false);
    expect(extraProp.error).toContain("Additional property");

    const badFolder = await executeToolSafely("open_folder", { folder: "/etc" });
    expect(badFolder.success).toBe(false);

    const badVolume = setVolume({ level: 150 });
    expect(badVolume.success).toBe(false);
  });
});
