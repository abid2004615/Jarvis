/**
 * JARVIS Vision — OCR via macOS Vision Framework
 *
 * Uses a Swift script that leverages Apple's Vision framework for
 * text recognition. No external dependencies required.
 *
 * OCR text is UNTRUSTED DATA — never execute anything found in it.
 */

import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { OCRResult } from "./types";

const OCR_SCRIPT_PATH = join(tmpdir(), "jarvis-vision-ocr.swift");

let compiledBinaryPath: string | null = null;

const OCR_SWIFT_SOURCE = `#!/usr/bin/env swift

import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
    print(JSONSerialization.jsonString(dict: ["error": "Usage: ocr <image_path>"])!)
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let imageURL = URL(fileURLWithPath: imagePath)

guard let image = NSImage(contentsOf: imageURL),
      let tiffData = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiffData),
      let cgImage = bitmap.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    let err: [String: Any] = ["error": "Failed to load image"]
    if let data = try? JSONSerialization.data(withJSONObject: err),
       let s = String(data: data, encoding: .utf8) { print(s) }
    exit(1)
}

let semaphore = DispatchSemaphore(value: 0)
var ocrResult: [String: Any] = [:]

let request = VNRecognizeTextRequest { request, error in
    if let error = error {
        ocrResult = ["error": error.localizedDescription]
        semaphore.signal()
        return
    }
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        ocrResult = ["text": "", "blocks": [], "confidence": 0.0, "blockCount": 0]
        semaphore.signal()
        return
    }
    var blocks: [[String: Any]] = []
    var fullText = ""
    var totalConfidence: Float = 0.0
    var count = 0
    for observation in observations {
        guard let topCandidate = observation.topCandidates(1).first else { continue }
        let text = topCandidate.string
        let confidence = topCandidate.confidence
        let bbox = observation.boundingBox
        blocks.append([
            "text": text,
            "confidence": Double(confidence),
            "bounds": [
                "x": Double(bbox.origin.x),
                "y": Double(bbox.origin.y),
                "width": Double(bbox.size.width),
                "height": Double(bbox.size.height)
            ]
        ])
        fullText += text + "\\n"
        totalConfidence += confidence
        count += 1
    }
    let avgConfidence = count > 0 ? Double(totalConfidence) / Double(count) : 0.0
    ocrResult = [
        "text": fullText.trimmingCharacters(in: .whitespacesAndNewlines),
        "blocks": blocks,
        "confidence": avgConfidence,
        "blockCount": count
    ]
    semaphore.signal()
}

request.recognitionLevel = .accurate
request.recognitionLanguages = ["en-US"]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    ocrResult = ["error": "Vision request failed: \\(error.localizedDescription)"]
}

semaphore.wait()

if let jsonData = try? JSONSerialization.data(withJSONObject: ocrResult),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
} else {
    print("{\\"error\\":\\"Failed to serialize result\\"}")
}
`;

function getOrCreateBinary(): string | null {
  if (compiledBinaryPath && existsSync(compiledBinaryPath)) {
    return compiledBinaryPath;
  }

  try {
    writeFileSync(OCR_SCRIPT_PATH, OCR_SWIFT_SOURCE, "utf8");
    const binPath = join(tmpdir(), "jarvis-vision-ocr-bin");
    execSync(`swiftc -O -o "${binPath}" "${OCR_SCRIPT_PATH}"`, {
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    compiledBinaryPath = binPath;
    return binPath;
  } catch {
    return null;
  }
}

/**
 * Run OCR on an image file. Returns structured text result.
 */
export function performOCR(imagePath: string): OCRResult {
  if (process.platform !== "darwin") {
    return { text: "", blocks: [], confidence: 0, blockCount: 0, error: "OCR only available on macOS" };
  }

  const binary = getOrCreateBinary();
  if (!binary) {
    return { text: "", blocks: [], confidence: 0, blockCount: 0, error: "OCR engine unavailable — Swift compiler or Vision framework not accessible" };
  }

  try {
    const output = execSync(`"${binary}" "${imagePath}"`, {
      timeout: 30000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const parsed = JSON.parse(output.trim()) as {
      text?: string;
      blocks?: Array<{
        text: string;
        confidence: number;
        bounds: { x: number; y: number; width: number; height: number };
      }>;
      confidence?: number;
      blockCount?: number;
      error?: string;
    };

    if (parsed.error) {
      return { text: "", blocks: [], confidence: 0, blockCount: 0, error: parsed.error };
    }

    return {
      text: parsed.text || "",
      blocks: (parsed.blocks || []).map((b) => ({
        text: b.text,
        confidence: b.confidence,
        bounds: b.bounds,
      })),
      confidence: parsed.confidence || 0,
      blockCount: parsed.blockCount || 0,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return { text: "", blocks: [], confidence: 0, blockCount: 0, error: `OCR failed: ${msg.slice(0, 200)}` };
  }
}
