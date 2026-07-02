export {
  HORUS_MODEL,
  loadHorusMemory,
  appendHorusMemory,
  horusChat,
  horusChatRaw,
  extractJson,
  type HorusMessage,
  type HorusToolCall,
  type HorusToolSpec,
  type HorusChatOptions,
  type HorusRawResult,
} from "./client.js";

export { HORUS_TOOLS, getHorusTools, executeHorusTool } from "./tools.js";
