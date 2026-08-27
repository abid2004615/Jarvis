/**
 * P15 — Configuration Types
 */

export type EnvironmentStatus = "ready" | "degraded" | "misconfigured";

export type SubsystemName =
  | "ai_provider"
  | "storage"
  | "voice"
  | "vision"
  | "computer_use"
  | "scheduler"
  | "personalization"
  | "memory";

export interface SubsystemCheck {
  name: SubsystemName;
  status: EnvironmentStatus;
  message: string;
  required: boolean;
}

export interface EnvironmentReport {
  status: EnvironmentStatus;
  subsystems: SubsystemCheck[];
  checkedAt: number;
}

export interface JarvisConfig {
  provider: string;
  model: string;
  hasApiKey: boolean;
  testMode: boolean;
  nodeEnv: string;
  aiTimeout: number;
  aiMaxRetries: number;
  maxConversationHistory: number;
  maxInputLength: number;
}
