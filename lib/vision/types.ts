/**
 * JARVIS Vision — Type Definitions
 *
 * Core types for the screen intelligence layer.
 * All screen content is treated as UNTRUSTED data.
 */

export interface ScreenDimensions {
  width: number;
  height: number;
}

export interface OCRBlock {
  text: string;
  confidence: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCRResult {
  text: string;
  blocks: OCRBlock[];
  confidence: number;
  blockCount: number;
  error?: string;
}

export interface ScreenContext {
  capturedAt: number;
  frontmostApplication?: {
    name: string;
    bundleId?: string;
  };
  activeWindow?: {
    title: string;
  };
  screenshotAvailable: boolean;
  screenshotPath?: string;
  screenDimensions?: ScreenDimensions;
  ocrText?: string;
  ocrConfidence?: number;
  ocrBlockCount?: number;
}

export interface ScreenFingerprint {
  frontmostApp: string;
  windowTitle: string;
  ocrHash: string;
}

export interface VisionConfig {
  enabled: boolean;
  screenAwareness: boolean;
  autoChangeDetection: boolean;
}

export interface VisionAnalysis {
  context: ScreenContext;
  description: string;
  untrustedContent: string;
  analyzedAt: number;
}
