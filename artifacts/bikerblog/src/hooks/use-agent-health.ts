import { useEffect, useState } from "react";

export type AgentHealthStatus = "checking" | "ok" | "unreachable";

export interface AgentHealthState {
  health: AgentHealthStatus;
  notConfigured: string | null;
  unreachableMessage: string | null;
  retry: () => void;
}

interface HealthResult {
  status?: "ok" | "not_configured" | "unreachable";
  message?: string;
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
 * verifica uno solo.
 */
export function useAgentHealth(
  healthEndpoint: string | string[],
  password: string | null,
  onUnauthorized: () => void,
  enabled = true
): AgentHealthState {
  const endpoints = Array.isArray(healthEndpoint) ? healthEndpoint : [healthEndpoint];
  const endpointsKey = endpoints.join(",");

  const [health, setHealth] = useState<AgentHealthStatus>("checking");
  const [notConfigured, setNotConfigured] = useState<string | null>(null);
  const [unreachableMessage, setUnreachableMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!enabled || !password) return;
    let cancelled = false;

    async function fetchHealth(endpoint: string): Promise<{ res: Response; data: HealthResult } | "unauthorized"> {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}${endpoint}`, {
        headers: { "X-Horus-Password": password! },
      });
      if (res.status === 401) return "unauthorized";
      if (!res.ok) return { res, data: {} };
      const data = (await res.json()) as HealthResult;
      return { res, data };
    }

    async function checkHealth() {
      setHealth("checking");
      setNotConfigured(null);
      setUnreachableMessage(null);
      try {
        const results = await Promise.all(endpoints.map(fetchHealth));
        if (cancelled) return;

        if (results.some((r) => r === "unauthorized")) {
          onUnauthorized();
          return;
        }

        const okResults = results as Exclude<(typeof results)[number], "unauthorized">[];

        if (okResults.some((r) => !r.res.ok)) {
          setUnreachableMessage("Impossibile verificare lo stato della connessione. Riprova tra poco.");
          setHealth("unreachable");
          return;
        }

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
      } catch {
        if (!cancelled) {
          setUnreachableMessage("Impossibile verificare la connessione. Controlla la rete e riprova.");
          setHealth("unreachable");
        }
      }
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
  };
}
