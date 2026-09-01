#!/usr/bin/env node
/**
 * Vosk model setup.
 *
 * The offline wake-word / speech model is ~68 MB extracted, so it is not kept
 * in git. This script fetches it on demand and is safe to re-run: an already
 * complete, verified model is left untouched.
 *
 * The Python companions can also self-heal via their own ensure_model(), but
 * that path cannot be relied on for a packaged build — electron-builder copies
 * companion/ into the signed app bundle, which is read-only at runtime. So the
 * model must exist on disk *before* packaging, which is why `npm run package`
 * depends on this script.
 *
 * Usage:
 *   npm run setup            # download if missing
 *   npm run setup -- --force # re-download even if present
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MODEL_NAME = "vosk-model-small-en-us-0.15";
const MODEL_URL = `https://alphacephei.com/vosk/models/${MODEL_NAME}.zip`;
const COMPANION_DIR = path.join(import.meta.dirname, "..", "companion");
const MODEL_DIR = path.join(COMPANION_DIR, MODEL_NAME);

/**
 * Files that must be present for the model to load, with the SHA-256 of the
 * build this project was tested against. Pinning these means a corrupted or
 * substituted download is rejected rather than silently used.
 */
const EXPECTED_FILES = {
  "am/final.mdl": "75370a0137f9daf8f469dedd7daa4513ae7a621f03240c6e512e2b50b656a7b6",
  "conf/model.conf": "8f14cb1eeb07c762c371db648c6be688d347236155ca0f64fb13b6567a8ce81f",
  "graph/HCLr.fst": "5caafba3081e1646545ac6bff0dd7a318e53dcbdc86f237909ce1d2ac1293d34",
  "graph/Gr.fst": "023c8b7e30704a9e37765c635c252e608a02f361235bf94abdcf2a5225d85b20",
  "ivector/final.ie": "3f37faf90c375b9e4740b569398b5829ed9cc07d19be6d441f72c3b71d7efcc6",
};

/** Other files vosk needs, where content is small/stable enough not to pin. */
const REQUIRED_EXTRAS = [
  "conf/mfcc.conf",
  "graph/disambig_tid.int",
  "graph/phones/word_boundary.int",
  "ivector/final.dubm",
  "ivector/final.mat",
  "ivector/global_cmvn.stats",
  "ivector/online_cmvn.conf",
  "ivector/splice.conf",
];

function log(message) {
  console.log(`[vosk-setup] ${message}`);
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/**
 * Report why the model is unusable, or null when it is complete and verified.
 */
function findProblem() {
  if (!fs.existsSync(MODEL_DIR)) return "not installed";

  for (const relative of REQUIRED_EXTRAS) {
    if (!fs.existsSync(path.join(MODEL_DIR, relative))) {
      return `missing ${relative}`;
    }
  }

  for (const [relative, expected] of Object.entries(EXPECTED_FILES)) {
    const target = path.join(MODEL_DIR, relative);
    if (!fs.existsSync(target)) return `missing ${relative}`;
    if (sha256(target) !== expected) return `checksum mismatch on ${relative}`;
  }

  return null;
}

function download() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-vosk-"));
  const archive = path.join(workDir, `${MODEL_NAME}.zip`);

  try {
    log(`downloading ${MODEL_URL}`);
    // curl and unzip ship with macOS, which is the only supported platform.
    execFileSync("curl", ["-fSL", "--retry", "3", "-o", archive, MODEL_URL], {
      stdio: ["ignore", "inherit", "inherit"],
    });

    log("extracting");
    execFileSync("unzip", ["-q", archive, "-d", workDir], { stdio: "inherit" });

    const extracted = path.join(workDir, MODEL_NAME);
    if (!fs.existsSync(extracted)) {
      throw new Error(`archive did not contain ${MODEL_NAME}/`);
    }

    // Replace any partial install only once the new copy is in hand.
    fs.rmSync(MODEL_DIR, { recursive: true, force: true });
    fs.mkdirSync(COMPANION_DIR, { recursive: true });
    fs.renameSync(extracted, MODEL_DIR);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function main() {
  const force = process.argv.includes("--force");
  const problem = findProblem();

  if (!problem && !force) {
    log(`model ready at companion/${MODEL_NAME}`);
    return;
  }

  log(force ? "forced re-download requested" : `model ${problem}`);
  download();

  const remaining = findProblem();
  if (remaining) {
    console.error(`[vosk-setup] verification failed after download: ${remaining}`);
    process.exit(1);
  }

  log(`model ready at companion/${MODEL_NAME}`);
}

main();
