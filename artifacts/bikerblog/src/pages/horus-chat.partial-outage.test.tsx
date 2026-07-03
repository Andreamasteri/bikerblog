import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HorusChat } from "./horus-chat";

const SESSION_KEY = "horus-chat-password";

/**
 * Task #161: quando SOLO uno tra più agenti registrati è irraggiungibile, il
 * gate di raggiungibilità deve nominare esplicitamente quello guasto (es.
 * "Bowie non è raggiungibile"), non un avviso collettivo generico che non
 * permette di capire quale dei due (o dei tre, ecc.) è effettivamente giù.
 */
describe("HorusChat - un solo agente su più giù", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.setItem(SESSION_KEY, "test-password");

    fetchMock = vi.fn((url: string) => {
      if (url.includes("horus/agents")) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => [
            { id: "horus", displayName: "Horus", healthEndpoint: "api/horus/health" },
            { id: "bowie", displayName: "Bowie", healthEndpoint: "api/horus/bowie-health" },
          ],
        });
      }
      if (url.includes("bowie-health")) {
        // Bowie down a livello di rete: nessun corpo JSON da cui il client
        // potrebbe altrimenti ricavare un messaggio già nominato dal server.
        return Promise.reject(new Error("network down"));
      }
      if (url.includes("horus/health")) {
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

  it("nomina l'agente guasto invece di un avviso generico su tutti", async () => {
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Horus ↔ Bowie/i }));

    const message = await screen.findByText(/Bowie non è raggiungibile/i);
    expect(message).toBeInTheDocument();
    expect(message.textContent).not.toMatch(/Horus non è raggiungibile/i);
  });
});
