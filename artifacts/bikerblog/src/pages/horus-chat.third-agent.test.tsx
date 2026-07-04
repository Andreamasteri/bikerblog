import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

describe("HorusChat - terzo interlocutore generico", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.setItem(SESSION_KEY, "test-password");

    fetchMock = vi.fn((url: string) => {
      if (url.includes("bowie-conversation")) {
        return Promise.resolve({
          status: 200,
          ok: true,
          body: makeSseBody([
            { event: "turn_start", data: { agent: "horus" } },
            { event: "turn_end", data: { agent: "horus", content: "Iniziamo la discussione." } },
            { event: "turn_start", data: { agent: "bowie" } },
            { event: "turn_end", data: { agent: "bowie", content: "Concordo, aggiungo qualcosa." } },
            { event: "turn_start", data: { agent: "quebracho" } },
            { event: "turn_end", data: { agent: "quebracho", content: "Bau, anche io ho un'opinione." } },
            { event: "done", data: {} },
          ]),
        });
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

  it("mostra un terzo agente non hardcoded senza rompere il rendering di Horus/Bowie", async () => {
    const user = userEvent.setup();
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Horus ↔ Bowie/i }));

    const topicInput = await screen.findByPlaceholderText(/Argomento della discussione/i);
    await user.type(topicInput, "Un argomento qualsiasi");

    const sendButtons = screen.getAllByRole("button");
    const sendButton = sendButtons.find((b) => b.querySelector("svg.lucide-play"));
    expect(sendButton).toBeTruthy();
    fireEvent.click(sendButton!);

    expect(await screen.findByText("Iniziamo la discussione.")).toBeInTheDocument();
    expect(await screen.findByText("Concordo, aggiungo qualcosa.")).toBeInTheDocument();
    expect(await screen.findByText("Bau, anche io ho un'opinione.")).toBeInTheDocument();

    // Il terzo agente riceve un'etichetta derivata dal suo id ("quebracho" ->
    // "Quebracho"), non un fallback generico tipo "Agente sconosciuto".
    expect(screen.getByText("Quebracho")).toBeInTheDocument();
    // Le etichette storiche restano invariate (usiamo getAllByText perché
    // "Horus"/"Bowie" compaiono anche altrove nell'interfaccia, es. nei tab).
    expect(screen.getAllByText("Horus").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bowie").length).toBeGreaterThan(0);
  });
});
