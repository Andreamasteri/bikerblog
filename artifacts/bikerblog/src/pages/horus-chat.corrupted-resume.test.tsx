import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HorusChat } from "./horus-chat";

const SESSION_KEY = "horus-chat-password";

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
    json: async () => ({ status: "ok" }),
  });
}

describe("HorusChat - conversazione salvata corrotta", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let bowieConversationCalls: number;

  beforeEach(() => {
    sessionStorage.setItem(SESSION_KEY, "test-password");
    bowieConversationCalls = 0;

    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("bowie-conversation")) {
        bowieConversationCalls += 1;
        if (bowieConversationCalls === 1) {
          // Primo tentativo: il turno di Bowie non arriva mai (drop-out di
          // rete), il server ci ripassa la trascrizione parziale già salvata
          // così l'utente può riprovare da dove si era interrotto.
          return Promise.resolve({
            status: 200,
            ok: true,
            body: makeSseBody([
              { event: "turn_start", data: { agent: "horus" } },
              { event: "turn_end", data: { agent: "horus", content: "Ciao Bowie, che ne pensi?" } },
              {
                event: "error",
                data: {
                  message: "Bowie: connessione interrotta.",
                  agent: "bowie",
                  transcript: [{ agent: "horus", content: "Ciao Bowie, che ne pensi?" }],
                  conversationId: 42,
                },
              },
            ]),
          });
        }
        // Il retry rimanda la trascrizione salvata al server, che questa
        // volta la rifiuta come corrotta/non ripristinabile con HTTP 400.
        return Promise.resolve({ status: 400, ok: false, body: null });
      }
      if (url.includes("horus/agents")) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => [
            { id: "horus", displayName: "Horus", healthEndpoint: "api/horus/health", isConfigured: true },
            { id: "bowie", displayName: "Bowie", healthEndpoint: "api/horus/bowie-health", isConfigured: true },
          ],
        });
      }
      if (url.includes("health")) {
        return healthOkResponse();
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

  it("mostra 'Nuova conversazione' (non 'Riprova') e non reinvia la trascrizione corrotta", async () => {
    const user = userEvent.setup();
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Horus ↔ Bowie/i }));

    const topicInput = await screen.findByPlaceholderText(/Argomento della discussione/i);
    await user.type(topicInput, "Moto d'epoca");

    const sendButtons = screen.getAllByRole("button");
    const sendButton = sendButtons.find((b) => b.querySelector("svg.lucide-play"));
    expect(sendButton).toBeTruthy();
    fireEvent.click(sendButton!);

    const retryButton = await screen.findByRole("button", { name: /Riprova/i });
    expect(retryButton).toBeInTheDocument();
    expect(screen.queryByText(/HTTP 400/)).not.toBeInTheDocument();

    fireEvent.click(retryButton);

    const corruptedMessage = await screen.findByText(/corrotta/i);
    expect(corruptedMessage).toBeInTheDocument();
    expect(screen.queryByText(/HTTP 400/)).not.toBeInTheDocument();

    const errorBanner = corruptedMessage.closest("div") as HTMLElement;
    expect(errorBanner).toBeTruthy();
    expect(within(errorBanner).queryByRole("button", { name: /Riprova/i })).not.toBeInTheDocument();

    const restartButton = within(errorBanner).getByRole("button", { name: /Nuova conversazione/i });
    expect(restartButton).toBeInTheDocument();

    const callsBeforeRestart = bowieConversationCalls;
    fireEvent.click(restartButton);

    await waitFor(() => {
      expect(screen.queryByText(/corrotta/i)).not.toBeInTheDocument();
    });
    expect(bowieConversationCalls).toBe(callsBeforeRestart);
  });
});
