import { useEffect, useState } from "react";

export type AgentHealthStatus = "checking" | "ok" | "unreachable";

export interface AgentHealthState {
  health: AgentHealthStatus;
  notConfigured: string | null;
  unreachableMessage: string | null;
  retry: () => void;
  /**
   * Nome del modello reale dietro ciascun endpoint di health check, es.
   * `{ "api/horus/health": "bikerlink:latest", "api/horus/bowie-health": "llama3.2:3b" }`.
   * Usato per affiancare "che cervello c'è davvero dietro il nome in codice"
   * ovunque lo stato dell'agente sia già mostrato, senza inventare una nuova UI.
   */
  modelsByEndpoint: Record<string, string>;
}

interface HealthResult {
  status?: "ok" | "not_configured" | "unreachable";
  message?: string;
  model?: string;
}

/** Un endpoint di health-check da controllare, opzionalmente etichettato con
 * il nome dell'agente a cui appartiene (Task #161): senza `displayName` non
 * è possibile costruire un messaggio "X non è raggiungibile" quando il
 * fallimento è a livello HTTP/rete (nessun corpo JSON dal server da cui
 * ricavare il nome), quindi si ricade sul messaggio generico storico. */
export type HealthEndpointSpec = string | { endpoint: string; displayName?: string };

function normalizeEndpoints(spec: string | HealthEndpointSpec[]): { endpoint: string; displayName?: string }[] {
  const list = Array.isArray(spec) ? spec : [spec];
  return list.map((e) => (typeof e === "string" ? { endpoint: e } : e));
}

/**
 * Controllo di raggiungibilità condiviso tra la chat diretta con un agente
 * (Horus/Bowie) e la conversazione osservata Horus↔Bowie: entrambe devono
 * scoprire subito (prima che l'utente scriva/avvii qualcosa) se un agente
 * non è configurato o non è raggiungibile, con lo stesso stato e lo stesso
 * comportamento di retry. Centralizzato qui per evitare che le due UI
 * divergano nel tempo (es. testi diversi o nuovi stati aggiunti solo in una).
 *
 * `healthEndpoint` accetta uno o più endpoint: la conversazione osservata
 * deve verificare sia Horus che Bowie (un problema su uno qualsiasi dei due
 * si scopriva altrimenti solo a metà turno), mentre la chat diretta ne
 * verifica uno solo. Ogni endpoint può portare un `displayName` (Task #161)
 * così, quando un solo agente su N va giù, il messaggio nomina esattamente
 * quale — non solo quando il server risponde 200 con uno stato applicativo
 * "unreachable" (che già include il nome), ma anche quando la richiesta
 * fallisce a livello di rete/HTTP, dove prima ricadeva su un messaggio
 * generico uguale per tutti gli agenti.
 */
export function useAgentHealth(
  healthEndpoint: string | HealthEndpointSpec[],
  password: string | null,
  onUnauthorized: () => void,
  enabled = true
): AgentHealthState {
  const endpointSpecs = normalizeEndpoints(healthEndpoint);
  const endpoints = endpointSpecs.map((e) => e.endpoint);
  const endpointsKey = endpointSpecs.map((e) => `${e.endpoint}:${e.displayName ?? ""}`).join(",");

  const [health, setHealth] = useState<AgentHealthStatus>("checking");
  const [notConfigured, setNotConfigured] = useState<string | null>(null);
  const [unreachableMessage, setUnreachableMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [modelsByEndpoint, setModelsByEndpoint] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!enabled || !password) return;
    let cancelled = false;

    // Ogni esito possibile per un singolo endpoint. A differenza della
    // versione precedente, un fallimento HTTP o di rete NON viene più
    // propagato come eccezione che fa fallire l'intero `Promise.all`:
    // resta scoped a questo endpoint, così un solo agente giù su N non
    // trasforma tutti gli altri in "sconosciuto" e possiamo nominarlo nel
    // messaggio (Task #161) invece di mostrare un avviso generico uguale
    // per qualunque causa/qualunque agente.
    type EndpointOutcome =
      | "unauthorized"
      | { kind: "ok"; data: HealthResult }
      | { kind: "http_error"; status: number }
      | { kind: "network_error" };

    async function fetchHealth(endpoint: string): Promise<EndpointOutcome> {
      try {
        const base = import.meta.env.BASE_URL;
        const res = await fetch(`${base}${endpoint}`, {
          headers: { "X-Horus-Password": password! },
        });
        if (res.status === 401) return "unauthorized";
        if (!res.ok) return { kind: "http_error", status: res.status };
        const data = (await res.json()) as HealthResult;
        return { kind: "ok", data };
      } catch {
        return { kind: "network_error" };
      }
    }

    function agentLabel(index: number): string {
      return endpointSpecs[index]?.displayName ?? "L'agente";
    }

    async function checkHealth() {
      setHealth("checking");
      setNotConfigured(null);
      setUnreachableMessage(null);
      if (cancelled) return;

      const results = await Promise.all(endpoints.map(fetchHealth));
      if (cancelled) return;

      if (results.some((r) => r === "unauthorized")) {
        onUnauthorized();
        return;
      }

      const models: Record<string, string> = {};
      endpoints.forEach((ep, i) => {
        const r = results[i];
        if (r && typeof r === "object" && r.kind === "ok") {
          const model = r.data.model;
          if (model) models[ep] = model;
        }
      });
      setModelsByEndpoint(models);

      // Un messaggio per ogni endpoint che NON è raggiungibile/ok, che nomina
      // esplicitamente l'agente coinvolto quando conosciamo il suo
      // `displayName` — così con N agenti si capisce subito quale dei tanti è
      // giù, invece di un avviso collettivo indistinguibile.
      const failureMessages: string[] = [];
      results.forEach((r, i) => {
        if (r === "unauthorized" || r.kind === "ok") return;
        if (r.kind === "http_error") {
          failureMessages.push(
            `${agentLabel(i)} non risponde correttamente in questo momento (errore HTTP ${r.status}). Riprova tra poco.`
          );
        } else {
          failureMessages.push(`${agentLabel(i)} non è raggiungibile in questo momento. Riprova tra poco.`);
        }
      });

      if (failureMessages.length > 0) {
        setUnreachableMessage(failureMessages.join(" "));
        setHealth("unreachable");
        return;
      }

      const okResults = results as Extract<EndpointOutcome, { kind: "ok" }>[];

      const unreachableMessages = okResults
        .map((r) => r.data)
        .filter((d) => d.status === "unreachable")
        .map((d) => d.message)
        .filter((m): m is string => Boolean(m));

      if (unreachableMessages.length > 0) {
        setUnreachableMessage(unreachableMessages.join(" "));
        setHealth("unreachable");
        return;
      }

      const notConfiguredMessages = okResults
        .map((r) => r.data)
        .filter((d) => d.status === "not_configured")
        .map((d) => d.message)
        .filter((m): m is string => Boolean(m));

      if (notConfiguredMessages.length > 0) {
        setNotConfigured(notConfiguredMessages.join(" "));
      }

      setHealth("ok");
    }

    void checkHealth();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointsKey, password, enabled, retryKey]);

  return {
    health,
    notConfigured,
    unreachableMessage,
    retry: () => setRetryKey((k) => k + 1),
    modelsByEndpoint,
  };
}

export interface AgentRegistryEntry {
  id: string;
  displayName: string;
  /** Percorso relativo (senza "/api") del suo endpoint di health check, es. "horus/health". */
  healthEndpoint: string;
}

export interface AgentRegistryState {
  agents: AgentRegistryEntry[];
  loadError: string | null;
  retry: () => void;
}

/**
 * Carica l'elenco degli agenti conversazionali e dei relativi endpoint di
 * health-check da `GET /horus/agents` (Task #156), così la UI non ha più un
 * elenco di endpoint scritto a mano: aggiungere o rimuovere un agente dal
 * registry lato server basta a far comparire/sparire il suo check qui, senza
 * toccare questo file.
 */
export function useAgentRegistry(password: string | null, onUnauthorized: () => void): AgentRegistryState {
  const [agents, setAgents] = useState<AgentRegistryEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!password) return;
    let cancelled = false;

    async function loadRegistry() {
      setLoadError(null);
      try {
        const base = import.meta.env.BASE_URL;
        const res = await fetch(`${base}api/horus/agents`, {
          headers: { "X-Horus-Password": password! },
        });
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AgentRegistryEntry[];
        if (!cancelled) setAgents(data);
      } catch {
        if (!cancelled) {
          setLoadError("Impossibile caricare l'elenco degli agenti. Controlla la rete e riprova.");
        }
      }
    }

    void loadRegistry();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, retryKey]);

  return { agents, loadError, retry: () => setRetryKey((k) => k + 1) };
}
