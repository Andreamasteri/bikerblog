import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AgentChatPanel } from "./agent-chat-panel";
import { healthResultJson } from "../test/agent-fixtures";

function healthOkResponse() {
  return Promise.resolve({
    status: 200,
    ok: true,
    json: async () => healthResultJson({ status: "ok" }),
  });
}

function renderPanel(emptyStateText: string, agentName: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("health")) return healthOkResponse();
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    })
  );

  return render(
    <AgentChatPanel
      endpoint={`api/horus/${agentName}-chat`}
      healthEndpoint={`api/horus/${agentName}-health`}
      password="test-password"
      onUnauthorized={() => {}}
      agentIcon={<span>{agentName[0].toUpperCase()}</span>}
      agentAvatarClassName=""
      emptyStateText={emptyStateText}
      placeholderText={`Scrivi a ${agentName}...`}
      agentName={agentName}
    />
  );
}

describe("AgentChatPanel - testo di presentazione (empty state)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mostra il testo di Horus quando non ci sono messaggi", async () => {
    const horusText = "Scrivi un messaggio per iniziare a chattare con Horus.";
    renderPanel(horusText, "horus");

    expect(await screen.findByText(horusText)).toBeInTheDocument();
  });

  it("mostra il testo poetico di Bowie (3 strofe) quando non ci sono messaggi", async () => {
    const bowieText = `Sono nato nel fuoco\nSon cresciuto giocando con l'acqua\n\nDavanti a me si son prostrati\nDei, Sovrani, Principi e servi\n\nM'ha accarezzato il vento\nParlami, sono qui per te.`;
    renderPanel(bowieText, "bowie");

    // Il testo ha newline: RTL normalizza gli spazi in findByText(string).
    // Usiamo una funzione che controlla il textContent grezzo e limita il match
    // al div che ha la classe whitespace-pre-line (non ai div antenati).
    const el = await screen.findByText(
      (_content, element) =>
        element?.classList?.contains("whitespace-pre-line") === true &&
        (element?.textContent ?? "").includes("Sono nato nel fuoco") &&
        (element?.textContent ?? "").includes("Davanti a me si son prostrati") &&
        (element?.textContent ?? "").includes("M'ha accarezzato il vento")
    );
    expect(el).toBeInTheDocument();
    expect(el.textContent).toContain("Sono nato nel fuoco");
    expect(el.textContent).toContain("Davanti a me si son prostrati");
    expect(el.textContent).toContain("M'ha accarezzato il vento");
    expect(el.textContent).toContain("Parlami, sono qui per te.");
  });

  it("mostra il testo di Quebracho quando non ci sono messaggi", async () => {
    const quebrachoText =
      "Qq: «Bentornato. Sono sempre contento di vederti. Usciamo?»";
    renderPanel(quebrachoText, "quebracho");

    expect(await screen.findByText(quebrachoText)).toBeInTheDocument();
  });

  it("il testo scompare una volta inviato il primo messaggio", async () => {
    const emptyText = "Testo iniziale che deve scomparire.";
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("health")) return healthOkResponse();
      if (url.includes("chat")) {
        const encoder = new TextEncoder();
        const chunk = encoder.encode(
          `event: done\ndata: ${JSON.stringify({ content: "Risposta!" })}\n\n`
        );
        let done = false;
        return Promise.resolve({
          status: 200,
          ok: true,
          body: {
            getReader() {
              return {
                read: async () => {
                  if (!done) {
                    done = true;
                    return { done: false, value: chunk };
                  }
                  return { done: true, value: undefined };
                },
              };
            },
          },
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as unknown as ReturnType<typeof vi.fn>;

    vi.stubGlobal("fetch", fetchMock);

    render(
      <AgentChatPanel
        endpoint="api/horus/chat"
        healthEndpoint="api/horus/health"
        password="test-password"
        onUnauthorized={() => {}}
        agentIcon={<span>H</span>}
        agentAvatarClassName=""
        emptyStateText={emptyText}
        placeholderText="Scrivi..."
        agentName="horus"
      />
    );

    expect(await screen.findByText(emptyText)).toBeInTheDocument();

    const textarea = await screen.findByPlaceholderText("Scrivi...");
    textarea.focus();
    Object.defineProperty(textarea, "value", { writable: true, value: "Ciao" });
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(textarea, { target: { value: "Ciao" } });
    fireEvent.submit(textarea.closest("form")!);

    expect(await screen.findByText("Risposta!")).toBeInTheDocument();
    expect(screen.queryByText(emptyText)).not.toBeInTheDocument();
  });
});
