export {
  HORUS_MODEL,
  BOWIE_AGENT_NAME,
  loadHorusMemory,
  appendHorusMemory,
  horusChat,
  horusChatRaw,
  isHorusConfigured,
  checkHorusHealth,
  isBowieConfigured,
  checkBowieHealth,
  bowieChatRaw,
  QUEBRACHO_AGENT_NAME,
  QUEBRACHO_NICKNAME,
  QUEBRACHO_FIXED_GREETING,
  isQuebrachoConfigured,
  checkQuebrachoHealth,
  quebrachoChatRaw,
  quebrachoChatRawResilient,
  isQuebrachoCloudFallbackConfigured,
  QUEBRACHO_CLOUD_FALLBACK_MODEL,
  createOllamaAgentClient,
  extractJson,
  OllamaGatewayTimeoutError,
  isGatewayTimeoutError,
  type HorusMessage,
  type HorusToolCall,
  type HorusToolSpec,
  type HorusChatOptions,
  type HorusRawResult,
  type OllamaAgentConfig,
  type OllamaAgentClient,
  type OllamaAgentHealth,
} from "./client.js";

export { HORUS_TOOLS, getHorusTools, executeHorusTool, capToolResult, MAX_TOOL_RESULT_CHARS } from "./tools.js";

export {
  loadVramAlertState,
  writeVramAlertState,
  loadActiveVramAlertPrompt,
  type VramAlertState,
} from "./vram-alert.js";

export {
  loadSupervisionAlertState,
  writeSupervisionAlertState,
  clearSupervisionAlertState,
  loadActiveSupervisionAlertPrompt,
  type SupervisionAlertState,
  type SupervisionAnomalyRecord,
} from "./supervision-alert.js";

export {
  recordLlmTrace,
  traceExcerpt,
  type LlmTraceInput,
  type LlmTraceSurface,
  type LlmTraceOutcome,
} from "./tracing.js";

export {
  persistSupervisionAnomalies,
  classifyOpenBacklogWithHorus,
  listSupervisionBacklog,
  getSupervisionBacklogItem,
  countOpenBacklog,
  updateBacklogStatus,
  setAresNotes,
  BACKLOG_CATEGORIES,
  type SupervisionBacklogAnomaly,
  type ListBacklogOptions,
  type BacklogCategory,
} from "./supervision-backlog.js";

export { ARCHITECT_SYSTEM_PROMPT } from "./prompts.js";

export {
  ARES_AGENT_NAME,
  isAresConfigured,
  checkAresHealth,
  aresModel,
  isAresRunning,
  ARES_BUSY_MESSAGE,
  listResidentModels,
  unloadModel,
  warmupModel,
  runAresAnalysis,
  type AresAnalysisResult,
  runAresTaskReview,
  type AresTaskReviewResult,
} from "./ares.js";
