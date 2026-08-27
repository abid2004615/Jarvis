/**
 * JARVIS Personalization — Public API
 */

// Types
export type {
  PreferenceCategory,
  PreferenceSource,
  UserPreference,
  PatternType,
  BehavioralPattern,
  SignalType,
  LearningSignal,
  Recommendation,
  RecommendationAction,
  PersonalizationSettings,
  PersonalizationStoreData,
  PersonalizationContext,
  PersonalizationResult,
} from "./types";

export {
  PREFERENCE_CATEGORIES,
  CATEGORY_LABELS,
  VALID_SOURCES,
  PERSONALIZATION_LIMITS,
  DEFAULT_SETTINGS,
  PERSONALIZATION_STORAGE_DIR,
  PERSONALIZATION_STORAGE_FILE,
} from "./types";

// Validator
export { validatePreferenceInput, validateSignalInput } from "./validator";

// Store
export { PersonalizationFileStore, InMemoryPersonalizationStore } from "./store";

// Signals
export { createSignal, trimSignals, aggregateSignals, countRecentSignals } from "./signals";

// Patterns
export { computePatternConfidence, getTimeBucket, upsertPattern, findRelevantPatterns } from "./patterns";

// Recommendations
export {
  generateRecommendations,
  dismissRecommendation,
  snoozeRecommendation,
  acceptRecommendation,
} from "./recommendations";

// Manager
export {
  PersonalizationManager,
  getPersonalizationManager,
  setPersonalizationManager,
  resetPersonalizationManager,
} from "./manager";

// Context
export {
  buildPersonalizationContext,
  isPreferenceRelevant,
  filterRelevantPreferences,
  insertPersonalizationContext,
} from "./context";

// Tools
export {
  getUserPreferences,
  setUserPreference,
  updateUserPreference,
  disableUserPreference,
  deleteUserPreference,
  getUsagePatterns,
  getRecommendations,
  dismissRecommendationById,
  acceptRecommendationById,
} from "./tools";

// Registration
export { registerPersonalizationTools, resetPersonalizationTools } from "./register";

// Wiring
export {
  wirePersonalizationToPipeline,
  resetPersonalizationWiring,
  getPersonalizationContextForQuery,
  resolveAmbiguousRequest,
  collectPipelineSignal,
  recordApplicationUsage,
  recordToolUsage,
  getPersonalizationForAgent,
  getPersonalizationForGoal,
} from "./wiring";
