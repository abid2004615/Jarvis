/**
 * P9 Tests — File Intelligence
 */

import { listFiles, searchFiles, openFile, revealInFinder, createFolder } from "@/lib/macos/files";

describe("P9 — File Intelligence", () => {
  test("listFiles returns structured result for allowed folder", () => {
    if (process.platform !== "darwin") return;
    const result = listFiles("Downloads");
    expect(typeof result.available).toBe("boolean");
    expect(Array.isArray(result.files)).toBe(true);
    expect(typeof result.count).toBe("number");
    if (result.available && result.files.length > 0) {
      expect(typeof result.files[0].name).toBe("string");
      expect(typeof result.files[0].isDirectory).toBe("boolean");
    }
  });

  test("listFiles rejects unallowed folder", () => {
    const result = listFiles("etc");
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("searchFiles returns structured result", () => {
    if (process.platform !== "darwin") return;
    const result = searchFiles("Downloads", "test");
    expect(typeof result.available).toBe("boolean");
    expect(Array.isArray(result.results)).toBe(true);
  });

  test("searchFiles requires query", () => {
    const result = searchFiles("Downloads", "");
    expect(result.available).toBe(false);
  });

  test("openFile returns structured result", () => {
    const result = openFile("Downloads", "");
    expect(typeof result.success).toBe("boolean");
  });

  test("revealInFinder returns structured result", () => {
    const result = revealInFinder("Downloads", "");
    expect(typeof result.success).toBe("boolean");
  });

  test("createFolder returns structured result", () => {
    const result = createFolder("Downloads", "");
    expect(typeof result.success).toBe("boolean");
  });

  test("createFolder rejects traversal", () => {
    const result = createFolder("Downloads", "../etc");
    expect(result.success).toBe(false);
  });

  test("createFolder rejects hidden names", () => {
    const result = createFolder("Downloads", ".hidden");
    expect(result.success).toBe(false);
  });
});
