/**
 * P15 Tests — Configuration, Environment, Storage, Lifecycle
 *
 * Tests for the final integration and production hardening layer.
 */

import {
  getConfig,
  validateEnvironment,
  getStatusMessage,
} from "@/lib/config/environment";
import type {
  EnvironmentReport,
  JarvisConfig,
} from "@/lib/config/types";
import {
  createFileStore,
  getStorageInfo,
  CURRENT_SCHEMA_VERSION,
} from "@/lib/storage/store";
import {
  getLifecyclePhase,
  isReady,
  getUptime,
  onLifecycleChange,
  registerCleanup,
  startup,
  shutdown,
  resetLifecycle,
} from "@/lib/lifecycle/index";

// ─── CONFIGURATION TESTS ───────────────────────────────────────

describe("P15 — Configuration", () => {
  it("reads configuration from environment", () => {
    const config = getConfig();
    expect(config).toBeDefined();
    expect(typeof config.provider).toBe("string");
    expect(typeof config.model).toBe("string");
    expect(typeof config.hasApiKey).toBe("boolean");
    expect(typeof config.testMode).toBe("boolean");
    expect(config.aiTimeout).toBeGreaterThan(0);
    expect(config.aiMaxRetries).toBeGreaterThan(0);
    expect(config.maxInputLength).toBe(10000);
  });

  it("detects test mode", () => {
    const config = getConfig();
    // In test environment, NODE_ENV is "test"
    expect(config.testMode).toBe(true);
  });

  it("has reasonable defaults", () => {
    const config = getConfig();
    expect(config.maxConversationHistory).toBe(50);
    expect(config.maxInputLength).toBe(10000);
    expect(config.aiMaxRetries).toBeLessThanOrEqual(5);
  });
});

// ─── ENVIRONMENT VALIDATION TESTS ──────────────────────────────

describe("P15 — Environment Validation", () => {
  it("produces a valid environment report", () => {
    const report = validateEnvironment();
    expect(report).toBeDefined();
    expect(report.status).toBeDefined();
    expect(report.subsystems.length).toBeGreaterThan(0);
    expect(report.checkedAt).toBeGreaterThan(0);
  });

  it("checks all required subsystems", () => {
    const report = validateEnvironment();
    const names = report.subsystems.map((s) => s.name);
    expect(names).toContain("ai_provider");
    expect(names).toContain("storage");
  });

  it("each subsystem has valid status", () => {
    const report = validateEnvironment();
    for (const sub of report.subsystems) {
      expect(["ready", "degraded", "misconfigured"]).toContain(sub.status);
      expect(typeof sub.message).toBe("string");
      expect(sub.message.length).toBeGreaterThan(0);
    }
  });

  it("produces a user-friendly status message", () => {
    const report = validateEnvironment();
    const message = getStatusMessage(report);
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
    // Should not contain technical details
    expect(message).not.toContain("gsk_");
    expect(message).not.toContain("API_KEY");
  });

  it("overall status is never null", () => {
    const report = validateEnvironment();
    expect(["ready", "degraded", "misconfigured"]).toContain(report.status);
  });
});

// ─── STORAGE TESTS ─────────────────────────────────────────────

describe("P15 — Storage", () => {
  const testStore = createFileStore<{ items: string[] }>(
    { storageDir: "cwd", fileName: "test-p15-store.json", schemaVersion: 1 },
    { items: [] },
  );

  afterEach(() => {
    testStore.reset();
  });

  it("creates and reads data", () => {
    testStore.save({ items: ["a", "b", "c"] });
    const data = testStore.load();
    expect(data.items).toEqual(["a", "b", "c"]);
  });

  it("returns default when no file exists", () => {
    const data = testStore.load();
    expect(data.items).toEqual([]);
  });

  it("file path is valid", () => {
    const filePath = testStore.getFilePath();
    expect(filePath).toContain("test-p15-store.json");
    expect(filePath).toContain(".jarvis");
  });

  it("backup creates a backup file", () => {
    testStore.save({ items: ["test"] });
    const backupPath = testStore.backup();
    expect(backupPath).not.toBeNull();
    expect(backupPath).toContain("backup-");
  });

  it("returns null backup when no file exists", () => {
    const backupPath = testStore.backup();
    expect(backupPath).toBeNull();
  });

  it("schema version is written", () => {
    testStore.save({ items: ["test"] });
    const fs = require("fs");
    const raw = fs.readFileSync(testStore.getFilePath(), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.updatedAt).toBeGreaterThan(0);
    expect(parsed.data.items).toEqual(["test"]);
  });

  it("handles corrupt data gracefully", () => {
    const fs = require("fs");
    const dir = require("path").dirname(testStore.getFilePath());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(testStore.getFilePath(), "NOT VALID JSON{", "utf-8");
    const data = testStore.load();
    expect(data.items).toEqual([]);
  });

  it("handles future version gracefully", () => {
    const fs = require("fs");
    const dir = require("path").dirname(testStore.getFilePath());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      testStore.getFilePath(),
      JSON.stringify({ version: 999, updatedAt: Date.now(), data: { items: ["x"] } }),
      "utf-8",
    );
    const data = testStore.load();
    expect(data.items).toEqual([]);
  });

  it("getStorageInfo returns structured info", () => {
    const info = getStorageInfo();
    expect(info).toBeDefined();
    expect(typeof info.memory).toBe("object");
    expect(typeof info.goals).toBe("object");
    expect(typeof info.automations).toBe("object");
  });
});

// ─── LIFECYCLE TESTS ───────────────────────────────────────────

describe("P15 — Lifecycle", () => {
  beforeEach(() => {
    resetLifecycle();
  });

  it("starts in idle state", () => {
    expect(getLifecyclePhase()).toBe("idle");
  });

  it("not ready initially", () => {
    expect(isReady()).toBe(false);
  });

  it("startup transitions to ready", async () => {
    await startup();
    expect(getLifecyclePhase()).toBe("ready");
    expect(isReady()).toBe(true);
  });

  it("startup is idempotent", async () => {
    await startup();
    await startup(); // Should not fail or restart
    expect(getLifecyclePhase()).toBe("ready");
  });

  it("shutdown transitions to stopped", async () => {
    await startup();
    await shutdown();
    expect(getLifecyclePhase()).toBe("stopped");
    expect(isReady()).toBe(false);
  });

  it("shutdown is idempotent", async () => {
    await startup();
    await shutdown();
    await shutdown(); // Should not fail
    expect(getLifecyclePhase()).toBe("stopped");
  });

  it("uptime is positive after startup", async () => {
    await startup();
    const uptime = getUptime();
    expect(uptime).toBeGreaterThanOrEqual(0);
  });

  it("notifies lifecycle listeners", async () => {
    const phases: string[] = [];
    const unsub = onLifecycleChange((phase) => {
      phases.push(phase);
    });

    await startup();
    unsub();

    expect(phases.length).toBeGreaterThan(0);
    expect(phases).toContain("ready");
  });

  it("cleanup functions run on shutdown", async () => {
    let cleaned = false;
    registerCleanup(() => { cleaned = true; });

    await startup();
    await shutdown();

    expect(cleaned).toBe(true);
  });

  it("cleanup functions run in reverse order", async () => {
    const order: number[] = [];
    registerCleanup(() => order.push(1));
    registerCleanup(() => order.push(2));
    registerCleanup(() => order.push(3));

    await startup();
    await shutdown();

    expect(order).toEqual([3, 2, 1]);
  });

  it("cleanup errors do not propagate", async () => {
    registerCleanup(() => { throw new Error("cleanup error"); });
    registerCleanup(() => { /* should still run */ });

    await startup();
    await shutdown(); // Should not throw

    expect(getLifecyclePhase()).toBe("stopped");
  });

  it("resetLifecycle returns to idle", async () => {
    await startup();
    resetLifecycle();
    expect(getLifecyclePhase()).toBe("idle");
  });
});

// ─── INTEGRATION: STARTUP VALIDATION ───────────────────────────

describe("P15 — Integration: Startup Validation", () => {
  it("startup validates environment", async () => {
    const report = validateEnvironment();
    expect(report.subsystems.length).toBeGreaterThan(0);

    // Startup should succeed regardless of environment status
    await startup();
    expect(isReady()).toBe(true);
  });

  it("configuration is accessible after startup", async () => {
    await startup();
    const config = getConfig();
    expect(config.provider).toBeDefined();
    expect(config.model).toBeDefined();
  });
});

// ─── INTEGRATION: STORAGE + LIFECYCLE ──────────────────────────

describe("P15 — Integration: Storage + Lifecycle", () => {
  const store = createFileStore<{ count: number }>(
    { storageDir: "cwd", fileName: "test-p15-integration.json", schemaVersion: 1 },
    { count: 0 },
  );

  afterEach(() => {
    store.reset();
    resetLifecycle();
  });

  it("storage works before and after lifecycle startup", async () => {
    // Before startup
    store.save({ count: 42 });
    const before = store.load();
    expect(before.count).toBe(42);

    // During startup
    await startup();
    const during = store.load();
    expect(during.count).toBe(42);

    // After shutdown
    await shutdown();
    const after = store.load();
    expect(after.count).toBe(42);
  });
});
