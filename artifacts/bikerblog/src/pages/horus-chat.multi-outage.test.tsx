import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HorusChat } from "./horus-chat";
import { agentsRegistryJson, HORUS_AGENT, BOWIE_AGENT, QUEBRACHO_AGENT } from "../test/agent-fixtures";

const SESSION_KEY = "horus-chat-password";

/**
 * Task #164: se DUE agenti su tre sono giù contemporaneamente, per due
 * ragioni diverse (uno risponde con un errore HTTP, l'altro fallisce a
 * livello di rete), il gate di raggiungibilità deve nominarli ENTRAMBI nel
 * messaggio finale. Copre il buco lasciato dal test del Task #161, che
 * verificava solo il caso di un singolo agente giù su più registrati e non
 * avrebbe rilevato una regressione nella logica di join dei messaggi (es.
 * `.find()`/`.some()` al posto di un accumulo su tutti i fallimenti).
 */
describe("HorusChat - due agenti su tre giù contemporaneamente", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.setItem(SESSION_KEY, "test-password");

    fetchMock = vi.fn((url: string) => {
      if (url.includes("horus/agents")) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => agentsRegistryJson([HORUS_AGENT, BOWIE_AGENT, QUEBRACHO_AGENT]),
        });
      }
      if (url.includes("horus/health")) {
        // Horus giù a livello HTTP (es. errore 500 dal server).
        return Promise.resolve({ status: 500, ok: false });
      }
      if (url.includes("bowie-health")) {
        // Bowie giù a livello di rete: nessun corpo JSON da cui ricavare un
        // messaggio già nominato dal server.
        return Promise.reject(new Error("network down"));
      }
      if (url.includes("quebracho-health")) {
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ status: "ok" }) });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as unknown as ReturnType<typeof vi.fn>;

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("nomina entrambi gli agenti guasti senza perderne uno", async () => {
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Horus ↔ Bowie/i }));

    const message = await screen.findByText((content, element) =>
      Boolean(
        element?.tagName === "P" &&
          /Horus non risponde correttamente/i.test(content) &&
          /Bowie non è raggiungibile/i.test(content)
      )
    );
    expect(message.textContent).toMatch(/Horus non risponde correttamente/i);
    expect(message.textContent).toMatch(/Bowie non è raggiungibile/i);
    // Il terzo agente è raggiungibile: non deve comparire come guasto.
    expect(message.textContent).not.toMatch(/Quebracho non/i);
  });
});
