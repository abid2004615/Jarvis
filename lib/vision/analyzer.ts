/**
 * JARVIS Vision — VisionProvider Abstraction
 *
 * Analyzes screen content using OCR + structured metadata.
 * Does NOT send images to the AI — the current Groq model is text-only.
 * Uses OCR-extracted text as the basis for "understanding" the screen.
 */

import type { ScreenContext, VisionAnalysis } from "./types";

/**
 * Analyze a screen context and produce a structured description.
 * This is the local analysis — no AI model call needed.
 */
export function analyzeScreenContext(context: ScreenContext): VisionAnalysis {
  const parts: string[] = [];

  if (context.frontmostApplication?.name) {
    parts.push(`Active application: ${context.frontmostApplication.name}`);
  }

  if (context.activeWindow?.title) {
    parts.push(`Window: ${context.activeWindow.title}`);
  }

  if (context.screenDimensions) {
    parts.push(`Screen: ${context.screenDimensions.width}x${context.screenDimensions.height}`);
  }

  if (context.ocrText) {
    parts.push(`Visible text (${context.ocrBlockCount} blocks, ${Math.round((context.ocrConfidence ?? 0) * 100)}% confidence):`);
    parts.push(context.ocrText);
  } else if (context.screenshotAvailable) {
    parts.push("Screenshot captured but no text could be extracted.");
  } else {
    parts.push("No screenshot available.");
  }

  return {
    context,
    description: parts.join("\n"),
    untrustedContent: context.ocrText || "",
    analyzedAt: Date.now(),
  };
}

/**
 * Check if a screen context has meaningful visual data.
 */
export function hasVisualContent(context: ScreenContext): boolean {
  return !!(context.ocrText && context.ocrText.length > 0);
}

/**
 * Get a short summary of the screen for conversation context.
 * Bounded length — never injects full OCR text.
 */
export function getScreenSummary(context: ScreenContext): string {
  const parts: string[] = [];
  if (context.frontmostApplication?.name) {
    parts.push(context.frontmostApplication.name);
  }
  if (context.activeWindow?.title) {
    parts.push(`"${context.activeWindow.title}"`);
  }
  if (context.ocrText) {
    const preview = context.ocrText.slice(0, 200);
    parts.push(`— "${preview}${context.ocrText.length > 200 ? "..." : ""}"`);
  }
  return parts.join(" ") || "No screen context available.";
}
