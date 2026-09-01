#!/usr/bin/env node
/**
 * Icon generation.
 *
 * Draws the JARVIS mark procedurally and emits:
 *   assets/icon.icns                     — app bundle icon (electron-builder)
 *   assets/trayTemplate.png / @2x.png    — menu bar icon
 *
 * Rendering is done with a tiny hand-rolled PNG encoder (zlib is in Node) so
 * the icons are reproducible from source and the repo needs no binary assets
 * and no image dependencies. `iconutil` ships with macOS.
 *
 * The mark is an arc-reactor style ring in the app's amber theme. The tray
 * variant is a macOS *template* image: black pixels plus alpha only, which lets
 * the system tint it correctly for light, dark, and highlighted menu bars.
 *
 * Usage: npm run icons
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/**
 * Icons live in assets/, not build/ — .gitignore already excludes /build as
 * production output, and these are committed source artifacts.
 */
const BUILD_DIR = path.join(import.meta.dirname, "..", "assets");

// Amber theme, matching styles/globals.css (#ffaa30 / #ffcc66).
const AMBER = { r: 255, g: 170, b: 48 };
const AMBER_BRIGHT = { r: 255, g: 214, b: 140 };
const BACKDROP = { r: 14, g: 10, b: 4 };

// ─── PNG encoding ──────────────────────────────────────────────

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encode RGBA pixel data (8-bit, non-interlaced) as a PNG buffer. */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type (0 = None).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── Drawing ───────────────────────────────────────────────────

/**
 * Coverage of a ring at a given pixel, sampled on a 3x3 grid so edges come out
 * antialiased instead of jagged.
 */
function ringCoverage(px, py, cx, cy, outer, inner) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const dx = px + (sx + 0.5) / 3 - cx;
      const dy = py + (sy + 0.5) / 3 - cy;
      const dist = Math.hypot(dx, dy);
      if (dist <= outer && dist >= inner) hits++;
    }
  }
  return hits / 9;
}

function discCoverage(px, py, cx, cy, radius) {
  return ringCoverage(px, py, cx, cy, radius, 0);
}

/**
 * The app icon: rounded dark plate, outer amber ring, inner core.
 * `size` is the full canvas; the mark is inset so it reads well in the Dock.
 */
function drawAppIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const plateRadius = size * 0.48;
  const plateCorner = size * 0.22;

  const outerR = size * 0.36;
  const outerInner = size * 0.29;
  const coreR = size * 0.15;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Rounded-square backdrop (squircle-ish via corner radius clamp).
      const dx = Math.abs(x + 0.5 - c);
      const dy = Math.abs(y + 0.5 - c);
      const limit = plateRadius;
      const cornerX = Math.max(0, dx - (limit - plateCorner));
      const cornerY = Math.max(0, dy - (limit - plateCorner));
      const inPlate =
        dx <= limit && dy <= limit && Math.hypot(cornerX, cornerY) <= plateCorner;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (inPlate) {
        // Subtle vertical lift so the plate is not flat black.
        const lift = 1 + (1 - y / size) * 0.5;
        r = Math.min(255, BACKDROP.r * lift);
        g = Math.min(255, BACKDROP.g * lift);
        b = Math.min(255, BACKDROP.b * lift);
        a = 255;
      }

      const ring = ringCoverage(x, y, c, c, outerR, outerInner);
      if (ring > 0) {
        r = r * (1 - ring) + AMBER.r * ring;
        g = g * (1 - ring) + AMBER.g * ring;
        b = b * (1 - ring) + AMBER.b * ring;
        a = Math.max(a, Math.round(255 * ring));
      }

      const core = discCoverage(x, y, c, c, coreR);
      if (core > 0) {
        r = r * (1 - core) + AMBER_BRIGHT.r * core;
        g = g * (1 - core) + AMBER_BRIGHT.g * core;
        b = b * (1 - core) + AMBER_BRIGHT.b * core;
        a = Math.max(a, Math.round(255 * core));
      }

      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = a;
    }
  }

  return encodePng(size, size, rgba);
}

/**
 * Menu bar template image: pure black with alpha, no colour. macOS recolours
 * template images itself, so encoding amber here would fight the system.
 */
function drawTrayTemplate(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2;
  // Thin ring plus dot; stays legible at 16px.
  const outerR = size * 0.44;
  const outerInner = size * 0.30;
  const coreR = size * 0.13;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const alpha = Math.max(
        ringCoverage(x, y, c, c, outerR, outerInner),
        discCoverage(x, y, c, c, coreR),
      );
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
      rgba[i + 3] = Math.round(255 * alpha);
    }
  }

  return encodePng(size, size, rgba);
}

// ─── Output ────────────────────────────────────────────────────

/** Sizes required for a complete .icns, as named by iconutil. */
const ICONSET = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

function main() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // Tray: 1x and 2x template images.
  fs.writeFileSync(path.join(BUILD_DIR, "trayTemplate.png"), drawTrayTemplate(16));
  fs.writeFileSync(path.join(BUILD_DIR, "trayTemplate@2x.png"), drawTrayTemplate(32));
  console.log("[icons] wrote assets/trayTemplate.png and @2x");

  // App icon: render an .iconset, then let iconutil pack it.
  const iconset = path.join(BUILD_DIR, "icon.iconset");
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });

  const rendered = new Map();
  for (const [name, size] of ICONSET) {
    if (!rendered.has(size)) rendered.set(size, drawAppIcon(size));
    fs.writeFileSync(path.join(iconset, name), rendered.get(size));
  }

  execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(BUILD_DIR, "icon.icns")], {
    stdio: "inherit",
  });
  // The .iconset is only an intermediate; the .icns is the artifact.
  fs.rmSync(iconset, { recursive: true, force: true });

  const bytes = fs.statSync(path.join(BUILD_DIR, "icon.icns")).size;
  console.log(`[icons] wrote assets/icon.icns (${bytes} bytes)`);
}

main();
