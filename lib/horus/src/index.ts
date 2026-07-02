export {
  HORUS_MODEL,
  BOWIE_AGENT_NAME,
  loadHorusMemory,
  appendHorusMemory,
  horusChat,
  horusChatRaw,
  isBowieConfigured,
  bowieChatRaw,
  createOllamaAgentClient,
  extractJson,
  type HorusMessage,
  type HorusToolCall,
  type HorusToolSpec,
  type HorusChatOptions,
  type HorusRawResult,
  type OllamaAgentConfig,
  type OllamaAgentClient,
} from "./client.js";

export { HORUS_TOOLS, getHorusTools, executeHorusTool } from "./tools.js";
