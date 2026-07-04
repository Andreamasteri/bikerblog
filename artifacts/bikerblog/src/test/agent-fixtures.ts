import type { AgentRegistryEntry, HealthResult } from "../hooks/use-agent-health";

/**
 * Fixture condivisa per i test della chat Horus/Bowie (Task #183).
 *
 * Prima, ogni test file costruiva l'elenco degli agenti come un letterale
 * oggetto non tipizzato (`{ id: "horus", displayName: "Horus", ... }`).
 * Quando `AgentRegistryEntry` ha guadagnato il campo `isConfigured` (di cui
 * il componente filtra la lista), i mock rimasti indietro non hanno fatto
 * fallire il typecheck: `json: async () => [...]` non era mai confrontato
 * col tipo reale, quindi il buco è emerso solo a runtime (agenti "invisibili"
 * perché `isConfigured` era `undefined`).
 *
 * Usando questo helper, il letterale di ogni test è tipizzato contro
 * `AgentRegistryEntry`: aggiungere un nuovo campo obbligatorio al registry
 * fa fallire IL TYPECHECK dei test che non lo passano, invece di rompere
 * silenziosamente il rendering.
 */
export function makeAgentRegistryEntry(overrides: Partial<AgentRegistryEntry> & Pick<AgentRegistryEntry, "id" | "displayName">): AgentRegistryEntry {
  return {
    healthEndpoint: `api/horus/${overrides.id}-health`,
    isConfigured: true,
    ...overrides,
  };
}

export const HORUS_AGENT: AgentRegistryEntry = makeAgentRegistryEntry({
  id: "horus",
  displayName: "Horus",
  healthEndpoint: "api/horus/health",
});

export const BOWIE_AGENT: AgentRegistryEntry = makeAgentRegistryEntry({
  id: "bowie",
  displayName: "Bowie",
  healthEndpoint: "api/horus/bowie-health",
});

export const QUEBRACHO_AGENT: AgentRegistryEntry = makeAgentRegistryEntry({
  id: "quebracho",
  displayName: "Quebracho",
  healthEndpoint: "api/horus/quebracho-health",
});

/** Risposta JSON tipizzata per `GET /horus/agents`, usata nei mock di `fetch`. */
export function agentsRegistryJson(agents: AgentRegistryEntry[]): AgentRegistryEntry[] {
  return agents;
}

/** Risposta JSON tipizzata per un endpoint `/*-health`, usata nei mock di `fetch`. */
export function healthResultJson(result: HealthResult): HealthResult {
  return result;
}
