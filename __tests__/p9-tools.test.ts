/**
 * P9 Tests — Tool Registry Integration
 * Verifies all P9 tools are registered and have correct schemas.
 */

import {
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
  getBuiltinTools,
} from "@/lib/tools/registry";

describe("P9 — Tool Registry Integration", () => {
  const p9Tools = [
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
  ];

  test("all P9 tools have required fields", () => {
    for (const tool of p9Tools) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
      expect(typeof tool.execute).toBe("function");
    }
  });

  test("read-only tools are safe (no confirmation)", () => {
    const safeTools = [
      GET_CLIPBOARD_TOOL,
      LIST_WINDOWS_TOOL,
      LIST_FILES_TOOL,
      SEARCH_FILES_TOOL,
      GET_SAFARI_STATE_TOOL,
      NEW_SAFARI_TAB_TOOL,
      GET_MUSIC_STATE_TOOL,
      GET_SYSTEM_SNAPSHOT_TOOL,
      GET_TODAY_EVENTS_TOOL,
      GET_UPCOMING_EVENTS_TOOL,
      GET_VSCODE_STATE_TOOL,
    ];
    for (const tool of safeTools) {
      expect(tool.riskLevel).toBe("safe");
      expect(tool.requiresUserConfirmation).toBe(false);
    }
  });

  test("action tools require confirmation", () => {
    const confirmTools = [
      FOCUS_APPLICATION_TOOL,
      MINIMIZE_WINDOW_TOOL,
      CLOSE_WINDOW_TOOL,
      OPEN_FILE_TOOL,
      REVEAL_FILE_TOOL,
      OPEN_URL_IN_SAFARI_TOOL,
      CLOSE_SAFARI_TAB_TOOL,
      CREATE_CALENDAR_EVENT_TOOL,
      FOCUS_VSCODE_TOOL,
    ];
    for (const tool of confirmTools) {
      expect(tool.riskLevel).toBe("confirmation");
      expect(tool.requiresUserConfirmation).toBe(true);
    }
  });

  test("all P9 tools are in getBuiltinTools()", () => {
    const builtin = getBuiltinTools();
    const builtinNames = builtin.map((t) => t.name);
    for (const tool of p9Tools) {
      expect(builtinNames).toContain(tool.name);
    }
  });

  test("control_music has valid enum values", () => {
    const schema = CONTROL_MUSIC_TOOL.inputSchema as any;
    expect(schema.properties.action.enum).toEqual(["play", "pause", "next", "previous"]);
  });

  test("SET_CLIPBOARD_TOOL does not require confirmation", () => {
    expect(SET_CLIPBOARD_TOOL.riskLevel).toBe("safe");
    expect(SET_CLIPBOARD_TOOL.requiresUserConfirmation).toBe(false);
  });

  test("CLEAR_CLIPBOARD_TOOL does not require confirmation", () => {
    expect(CLEAR_CLIPBOARD_TOOL.riskLevel).toBe("safe");
    expect(CLEAR_CLIPBOARD_TOOL.requiresUserConfirmation).toBe(false);
  });
});
