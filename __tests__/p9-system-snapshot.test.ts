/**
 * P9 Tests — System Snapshot
 */

import { getSystemSnapshot } from "@/lib/macos/system-snapshot";

describe("P9 — System Snapshot", () => {
  test("getSystemSnapshot returns all fields", () => {
    const snapshot = getSystemSnapshot();
    expect(typeof snapshot.timestamp).toBe("string");
    expect(typeof snapshot.cpu).toBe("object");
    expect(typeof snapshot.memory).toBe("object");
    expect(typeof snapshot.disk).toBe("object");
    expect(typeof snapshot.battery).toBe("object");
    expect(typeof snapshot.network).toBe("object");
    expect(typeof snapshot.uptime).toBe("object");
    expect(typeof snapshot.frontmostApplication).toBe("object");
    expect(typeof snapshot.activeWindow).toBe("object");
    expect(typeof snapshot.runningApplications).toBe("object");
    expect(typeof snapshot.processSummary).toBe("object");
  });

  test("getSystemSnapshot has real timestamp", () => {
    const snapshot = getSystemSnapshot();
    const ts = new Date(snapshot.timestamp);
    expect(ts.getTime()).toBeGreaterThan(0);
  });

  test("getSystemSnapshot runningApplications has count and names", () => {
    if (process.platform !== "darwin") return;
    const snapshot = getSystemSnapshot();
    expect(typeof snapshot.runningApplications.count).toBe("number");
    expect(Array.isArray(snapshot.runningApplications.names)).toBe(true);
  });

  test("getSystemSnapshot cpu has available flag", () => {
    const snapshot = getSystemSnapshot();
    expect(typeof snapshot.cpu.available).toBe("boolean");
  });

  test("getSystemSnapshot frontmostApplication has available flag", () => {
    const snapshot = getSystemSnapshot();
    expect(typeof snapshot.frontmostApplication.available).toBe("boolean");
  });
});
