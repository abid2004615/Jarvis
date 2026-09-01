/**
 * Icon assets and packaging wiring.
 *
 * The app previously shipped with build.mac.icon = null and a tray built from
 * nativeImage.createEmpty(), so JARVIS.app had a placeholder Dock icon and an
 * invisible menu bar item. These tests pin the assets and, just as importantly,
 * the two pieces of config that decide whether they reach the packaged app.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const ICNS = path.join(ASSETS, "icon.icns");
const TRAY = path.join(ASSETS, "trayTemplate.png");
const TRAY_2X = path.join(ASSETS, "trayTemplate@2x.png");

/** Width/height from a PNG IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function isPng(file: string): boolean {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return fs.readFileSync(file).subarray(0, 8).equals(signature);
}

describe("App icons — assets", () => {
  test("app icon exists and is a real .icns", () => {
    expect(fs.existsSync(ICNS)).toBe(true);
    // .icns files start with the magic "icns".
    const header = fs.readFileSync(ICNS).subarray(0, 4).toString("ascii");
    expect(header).toBe("icns");
  });

  test("app icon declares a length matching its file size", () => {
    const buf = fs.readFileSync(ICNS);
    // Bytes 4..8 are the total file length; a truncated icon fails here.
    expect(buf.readUInt32BE(4)).toBe(buf.length);
  });

  test("app icon is large enough to contain retina sizes", () => {
    // A 512@2x representation alone is tens of KB; a stub would be far smaller.
    expect(fs.statSync(ICNS).size).toBeGreaterThan(20_000);
  });

  test("tray icons exist and are valid PNGs", () => {
    expect(fs.existsSync(TRAY)).toBe(true);
    expect(fs.existsSync(TRAY_2X)).toBe(true);
    expect(isPng(TRAY)).toBe(true);
    expect(isPng(TRAY_2X)).toBe(true);
  });

  test("tray icons are 16px with a 32px retina variant", () => {
    expect(pngSize(TRAY)).toEqual({ width: 16, height: 16 });
    expect(pngSize(TRAY_2X)).toEqual({ width: 32, height: 32 });
  });

  test("tray icon is named as a macOS template image", () => {
    // The Template suffix is the macOS convention; combined with
    // setTemplateImage(true) it lets the system tint for light/dark menu bars.
    expect(path.basename(TRAY)).toMatch(/Template\.png$/);
    expect(path.basename(TRAY_2X)).toMatch(/Template@2x\.png$/);
  });
});

describe("App icons — packaging wiring", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));

  test("macOS build points at the generated icon", () => {
    expect(pkg.build.mac.icon).toBe("assets/icon.icns");
  });

  test("assets are included in the packaged app", () => {
    // Without this the tray PNG is missing at runtime, since build.files
    // otherwise only ships electron/dist.
    expect(pkg.build.files).toContain("assets/**/*");
  });

  test("icons can be regenerated from source", () => {
    expect(pkg.scripts.icons).toBe("node scripts/generate-icons.mjs");
    expect(fs.existsSync(path.join(ROOT, "scripts", "generate-icons.mjs"))).toBe(true);
  });
});

describe("Electron main — tray icon", () => {
  const mainSource = fs.readFileSync(path.join(ROOT, "electron", "main.ts"), "utf-8");

  test("tray no longer uses an empty image", () => {
    expect(mainSource).not.toContain("nativeImage.createEmpty()");
  });

  test("tray loads the template asset and marks it as a template", () => {
    expect(mainSource).toContain("trayTemplate.png");
    expect(mainSource).toContain("setTemplateImage(true)");
  });

  test("tray path resolves via getAppPath so it works packaged and in dev", () => {
    expect(mainSource).toContain("app.getAppPath()");
  });
});

describe("Electron build output — no stale compiled artifacts", () => {
  test("compiled output is not committed beside the TypeScript sources", () => {
    // electron/main.js was a leftover from an older tsconfig without outDir.
    // It went stale and shadowed the real entry point when grepped.
    for (const stale of ["main.js", "main.js.map", "preload.js", "preload.js.map"]) {
      expect(fs.existsSync(path.join(ROOT, "electron", stale))).toBe(false);
    }
  });

  test("the entry point is the compiled file under dist", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
    expect(pkg.main).toBe("electron/dist/main.js");
  });

  test("electron tsconfig emits into dist", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(ROOT, "electron", "tsconfig.json"), "utf-8"),
    );
    expect(tsconfig.compilerOptions.outDir).toBe("./dist");
  });
});
