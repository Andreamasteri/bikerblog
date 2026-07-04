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
  isQuebrachoConfigured,
  checkQuebrachoHealth,
  quebrachoChatRaw,
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
