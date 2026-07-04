import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentChatPanel } from "./agent-chat-panel";
import { healthResultJson } from "../test/agent-fixtures";

/**
 * Task #188: quando l'agente fallisce per un timeout/sovraccarico segnalato
 * dal server come evento SSE `error` con `recoverable: true`, la chat diretta
 * deve mostrare lo stesso "Riprova" a un click già usato per il drop lato
 * client — e NON mostrarlo quando l'errore non è recuperabile ("nessuna
 * risposta") o quando l'agente non è configurato (503).
 */

/**
 * Costruisce un `body` fetch-like che simula uno stream SSE emettendo gli
 * eventi indicati in sequenza, senza dipendere da un vero ReadableStream
 * (il codice sotto test usa solo `.getReader().read()`).
 */
function makeSseBody(events: { event: string; data: unknown }[]) {
  const encoder = new TextEncoder();
  const chunks = events.map((e) =>
    encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
  );
  let i = 0;
  return {
    getReader() {
      return {
        read: async () => {
          if (i < chunks.length) {
            return { done: false, value: chunks[i++] };
          }
          return { done: true, value: undefined };
        },
      };
    },
  };
}

function healthOkResponse() {
  return Promise.resolve({
    status: 200,
    ok: true,
    json: async () => healthResultJson({ status: "ok" }),
  });
}

function renderPanel() {
  return render(
    <AgentChatPanel
      endpoint="api/horus/chat"
      healthEndpoint="api/horus/health"
      password="test-password"
      onUnauthorized={() => {}}
      agentIcon={<span>H</span>}
      agentAvatarClassName=""
      emptyStateText="Scrivi qualcosa"
      placeholderText="Messaggio"
      agentName="horus"
    />
  );
}

async function sendMessage(text: string) {
  const user = userEvent.setup();
  const textarea = await screen.findByPlaceholderText("Messaggio");
  await user.type(textarea, text);
  const buttons = screen.getAllByRole("button");
  const sendButton = buttons.find((b) => b.querySelector("svg.lucide-send"));
  expect(sendButton).toBeTruthy();
  fireEvent.click(sendButton!);
}

describe("AgentChatPanel - Riprova su errore del server", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mostra 'Riprova' su un evento SSE error recuperabile e rimanda messaggio + cronologia identici", async () => {
    const chatBodies: string[] = [];
    let chatCalls = 0;

    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("horus/health")) return healthOkResponse();
      if (url.includes("horus/chat")) {
        chatCalls += 1;
        chatBodies.push(String(init?.body ?? ""));
        if (chatCalls === 1) {
          // Primo invio: il server segnala un timeout transitorio recuperabile.
          return Promise.resolve({
            status: 200,
            ok: true,
            body: makeSseBody([
              {
                event: "error",
                data: {
                  message:
                    "Il server ha impiegato troppo tempo a rispondere (timeout). Riprova tra qualche istante.",
                  recoverable: true,
                },
              },
            ]),
          });
        }
        // Retry: questa volta la risposta arriva (dalla cache del server).
        return Promise.resolve({
          status: 200,
          ok: true,
          body: makeSseBody([{ event: "done", data: { content: "Ciao!" } }]),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as unknown as ReturnType<typeof vi.fn>;

    vi.stubGlobal("fetch", fetchMock);

    renderPanel();
    await sendMessage("Buongiorno");

    const retryButton = await screen.findByRole("button", { name: /Riprova/i });
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);

    expect(await screen.findByText("Ciao!")).toBeInTheDocument();

    // Il retry deve rimandare messaggio + cronologia identici alla prima
    // richiesta (stessa chiave di cache lato server).
    expect(chatCalls).toBe(2);
    const first = JSON.parse(chatBodies[0]) as { message: string; history: unknown[] };
    const second = JSON.parse(chatBodies[1]) as { message: string; history: unknown[] };
    expect(second.message).toBe(first.message);
    expect(second.message).toBe("Buongiorno");
    expect(second.history).toEqual(first.history);
  });

  it("NON mostra 'Riprova' su un evento SSE error non recuperabile (nessuna risposta)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("horus/health")) return healthOkResponse();
      if (url.includes("horus/chat")) {
        return Promise.resolve({
          status: 200,
          ok: true,
          body: makeSseBody([
            {
              event: "error",
              data: {
                message: "horus non ha restituito una risposta. Riprova con un'altra domanda.",
                recoverable: false,
              },
            },
          ]),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as unknown as ReturnType<typeof vi.fn>;

    vi.stubGlobal("fetch", fetchMock);

    renderPanel();
    await sendMessage("Buongiorno");

    await screen.findByText(/non ha restituito una risposta/i);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Riprova/i })).not.toBeInTheDocument();
    });
  });

  it("NON mostra 'Riprova' quando l'agente non è configurato (HTTP 503)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("horus/health")) return healthOkResponse();
      if (url.includes("horus/chat")) {
        return Promise.resolve({
          status: 503,
          ok: false,
          json: async () => ({ message: "Questo agente non è configurato su questo ambiente." }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as unknown as ReturnType<typeof vi.fn>;

    vi.stubGlobal("fetch", fetchMock);

    renderPanel();
    await sendMessage("Buongiorno");

    await screen.findByText(/non è configurato/i);
    expect(screen.queryByRole("button", { name: /Riprova/i })).not.toBeInTheDocument();
  });
});
