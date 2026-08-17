/**
 * JARVIS Persistent Memory — Store Tests
 * File-backed persistence with atomic writes, corrupt-file quarantine, and an
 * in-memory store for tests. All filesystem tests use a temp directory.
 */

import fs from "fs";
import os from "os";
import path from "path";

import {
  MemoryFileStore,
  InMemoryMemoryStore,
  getDefaultMemoryFilePath,
} from "@/lib/memory/store";
import { MemoryManager } from "@/lib/memory/manager";
import { MEMORY_STORAGE_DIR, MEMORY_STORAGE_FILE } from "@/lib/memory/types";
import type { MemoryEntry } from "@/lib/memory/types";

function makeEntry(overrides: Partial<MemoryEntry>): MemoryEntry {
  return {
    id: "m1",
    category: "preference",
    key: "theme",
    value: "dark mode",
    createdAt: 1,
    updatedAt: 1,
    source: "user",
    confidence: 1,
    ...overrides,
  };
}

describe("MemoryFileStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-mem-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("load returns [] when the file does not exist", () => {
    const store = new MemoryFileStore(path.join(dir, "memory.json"));
    expect(store.load()).toEqual([]);
  });

  test("round-trips entries atomically", () => {
    const file = path.join(dir, "memory.json");
    const store = new MemoryFileStore(file);
    store.save([makeEntry({ id: "a", key: "theme" }), makeEntry({ id: "b", key: "voice" })]);

    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { version: number; entries: MemoryEntry[] };
    expect(raw.version).toBe(1);
    expect(raw.entries).toHaveLength(2);
    expect(new MemoryFileStore(file).load()).toHaveLength(2);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  test("quarantines a corrupt file and starts fresh", () => {
    const file = path.join(dir, "memory.json");
    fs.writeFileSync(file, "this is { not json", "utf8");

    const store = new MemoryFileStore(file);
    expect(store.load()).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readdirSync(dir).some((name) => name.startsWith("memory.json.corrupt-"))).toBe(true);
  });

  test("ignores malformed entries but keeps valid ones", () => {
    const file = path.join(dir, "memory.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        updatedAt: 1,
        entries: [
          makeEntry({ id: "ok", key: "valid" }),
          { id: "bad", key: "no category" },
          "garbage" as unknown,
        ],
      }),
      "utf8",
    );
    const entries = new MemoryFileStore(file).load();
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe("valid");
  });

  test("bounds the number of entries persisted", () => {
    const file = path.join(dir, "memory.json");
    const store = new MemoryFileStore(file);
    const entries = Array.from({ length: 150 }, (_, i) => makeEntry({ id: `e${i}`, key: `k${i}` }));
    store.save(entries);
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { entries: MemoryEntry[] };
    expect(raw.entries).toHaveLength(100);
  });

  test("default path lives under a fixed .jarvis dir in cwd", () => {
    const p = getDefaultMemoryFilePath();
    expect(p).toBe(path.join(process.cwd(), MEMORY_STORAGE_DIR, MEMORY_STORAGE_FILE));
  });
});

describe("InMemoryMemoryStore", () => {
  test("load/save/seed round-trip", () => {
    const store = new InMemoryMemoryStore();
    store.seed([makeEntry({ id: "a", key: "theme" })]);
    expect(store.load()).toHaveLength(1);

    store.save([makeEntry({ id: "b", key: "voice" })]);
    expect(store.raw).toHaveLength(1);
    expect(store.raw[0].key).toBe("voice");
  });
});

describe("MemoryManager persistence wiring", () => {
  test("persists mutations through the store and reloads them", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-mem-mgr-"));
    const file = path.join(dir, "memory.json");
    try {
      const store = new MemoryFileStore(file);
      const manager = new MemoryManager(store);
      manager.remember({ key: "preferred theme", value: "dark mode" });
      expect(manager.count()).toBe(1);

      const reloaded = new MemoryManager(new MemoryFileStore(file));
      expect(reloaded.count()).toBe(1);
      expect(reloaded.recall("theme")).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
