import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AgentHealthStatus } from "./use-agent-health";

export interface AgentHealthGateProps {
  health: AgentHealthStatus;
  unreachableMessage: string | null;
  onRetry: () => void;
  checkingLabel?: string;
  unreachableFallback?: string;
}

/**
 * Stati "checking"/"unreachable" condivisi tra la chat diretta e la
 * conversazione osservata Horus↔Bowie (vedi `useAgentHealth`). Ritorna
 * `null` quando lo stato è "ok", lasciando al chiamante il rendering del
 * resto della UI (che differisce tra le due modalità).
 */
export function AgentHealthGate({
  health,
  unreachableMessage,
  onRetry,
  checkingLabel = "Verifica della connessione in corso…",
  unreachableFallback = "L'agente non è raggiungibile in questo momento.",
}: AgentHealthGateProps) {
  if (health === "checking") {
    return (
      <div className="flex-1 border border-border bg-muted/5 mb-4 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="w-4 h-4" />
          {checkingLabel}
        </div>
      </div>
    );
  }

  if (health === "unreachable") {
    return (
      <div className="flex-1 border border-border bg-muted/5 mb-4 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground text-center max-w-sm px-6">
          {unreachableMessage ?? unreachableFallback}
        </p>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onRetry}>
          <RotateCcw className="w-4 h-4" />
          Riprova
        </Button>
      </div>
    );
  }

  return null;
}
