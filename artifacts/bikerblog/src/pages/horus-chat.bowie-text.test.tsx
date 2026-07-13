import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HorusChat } from "./horus-chat";
import {
  agentsRegistryJson,
  healthResultJson,
  HORUS_AGENT,
  BOWIE_AGENT,
  QUEBRACHO_AGENT,
} from "../test/agent-fixtures";

const SESSION_KEY = "horus-chat-password";

const BOWIE_STROFA_1 = "Sono nato nel fuoco";
const BOWIE_STROFA_2 = "Davanti a me si son prostrati";
const BOWIE_STROFA_3 = "M'ha accarezzato il vento";

const QUEBRACHO_TEXT =
  "Qq: «Bentornato. Sono sempre contento di vederti. Usciamo?»";

function healthOkResponse() {
  return Promise.resolve({
    status: 200,
    ok: true,
    json: async () => healthResultJson({ status: "ok" }),
  });
}

describe("HorusChat - testi di presentazione degli agenti", () => {
  beforeEach(() => {
    sessionStorage.setItem(SESSION_KEY, "test-password");

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("horus/agents")) {
          return Promise.resolve({
            status: 200,
            ok: true,
            json: async () =>
              agentsRegistryJson([HORUS_AGENT, BOWIE_AGENT, QUEBRACHO_AGENT]),
          });
        }
        if (url.includes("health")) return healthOkResponse();
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mostra le 3 strofe poetiche di Bowie in modalità chat con Bowie", async () => {
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Chat con Bowie/i }));

    // Il testo ha newline: usiamo una funzione che controlla il textContent
    // grezzo limitando il match al div whitespace-pre-line (non agli antenati).
    const emptyStateDiv = await screen.findByText(
      (_content, element) =>
        element?.classList?.contains("whitespace-pre-line") === true &&
        (element?.textContent ?? "").includes(BOWIE_STROFA_1) &&
        (element?.textContent ?? "").includes(BOWIE_STROFA_2) &&
        (element?.textContent ?? "").includes(BOWIE_STROFA_3)
    );
    expect(emptyStateDiv).toBeInTheDocument();
    expect(emptyStateDiv.textContent).toContain(BOWIE_STROFA_1);
    expect(emptyStateDiv.textContent).toContain(BOWIE_STROFA_2);
    expect(emptyStateDiv.textContent).toContain(BOWIE_STROFA_3);
  });

  it("contiene le parole 'Parlami, sono qui per te' nella presentazione di Bowie", async () => {
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Chat con Bowie/i }));

    const emptyStateDiv = await screen.findByText(
      (_content, element) =>
        element?.classList?.contains("whitespace-pre-line") === true &&
        (element?.textContent ?? "").includes("Parlami, sono qui per te")
    );
    expect(emptyStateDiv).toBeInTheDocument();
  });

  it("mostra il testo di presentazione di Quebracho in modalità chat con Quebracho", async () => {
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Chat con Quebracho/i }));

    expect(await screen.findByText(QUEBRACHO_TEXT)).toBeInTheDocument();
  });

  it("mostra il testo di Horus nella modalità default (senza cambiare tab)", async () => {
    render(<HorusChat />);

    // La modalità default è Horus: il suo testo di presentazione deve apparire
    // senza bisogno di cliccare alcun tab.
    const horusText = await screen.findByText(
      "Scrivi un messaggio per iniziare a chattare con Horus."
    );
    expect(horusText).toBeInTheDocument();
  });
});
