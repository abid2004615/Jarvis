/**
 * P9 Tests — VS Code Integration
 */

import { isVSCodeRunning, getVSCodeState, focusVSCode, openVSCode } from "@/lib/macos/apps/vscode";

describe("P9 — VS Code Integration", () => {
  test("isVSCodeRunning returns boolean", () => {
    const result = isVSCodeRunning();
    expect(typeof result).toBe("boolean");
  });

  test("getVSCodeState returns structured result", () => {
    const result = getVSCodeState();
    expect(typeof result.available).toBe("boolean");
    expect(typeof result.isRunning).toBe("boolean");
  });

  test("focusVSCode returns structured result", () => {
    const result = focusVSCode();
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });

  test("openVSCode returns structured result", () => {
    const result = openVSCode();
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });

  test("openVSCode rejects unsafe paths", () => {
    const result = openVSCode("/etc/passwd");
    expect(result.success).toBe(false);
  });

  test("openVSCode rejects traversal paths", () => {
    const result = openVSCode("../../../etc");
    expect(result.success).toBe(false);
  });
});
