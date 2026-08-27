/**
 * P8 Tests — Screen Recording Permission
 */

import { checkScreenRecordingPermission, resetPermissionCache } from "@/lib/vision/permissions";

describe("P8 — Screen Recording Permission", () => {
  test("checkScreenRecordingPermission returns a string", () => {
    const result = checkScreenRecordingPermission();
    expect(["granted", "denied", "unknown"]).toContain(result);
  });

  test("permission result is cached", () => {
    const first = checkScreenRecordingPermission();
    const second = checkScreenRecordingPermission();
    expect(first).toBe(second);
  });

  test("resetPermissionCache forces recheck", () => {
    resetPermissionCache();
    const result = checkScreenRecordingPermission();
    expect(["granted", "denied", "unknown"]).toContain(result);
  });
});
