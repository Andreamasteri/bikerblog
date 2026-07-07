import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentChatPanel } from "./agent-chat-panel";
import { healthResultJson } from "../test/agent-fixtures";

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

function renderPanelWithModeSelector() {
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
      showModeSelector={true}
    />
  );
}

describe("AgentChatPanel - mode switch clears history", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("azzera la cronologia quando si cambia da Default ad Architect", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("horus/health")) return healthOkResponse();
      if (url.includes("horus/chat")) {
        return Promise.resolve({
          status: 200,
          ok: true,
          body: makeSseBody([{ event: "done", data: { content: "Risposta di test" } }]),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as unknown as ReturnType<typeof vi.fn>;

    vi.stubGlobal("fetch", fetchMock);

    renderPanelWithModeSelector();

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText("Messaggio");
    await user.type(textarea, "Ciao Horus");
    const buttons = screen.getAllByRole("button");
    const sendButton = buttons.find((b) => b.querySelector("svg.lucide-send"));
    expect(sendButton).toBeTruthy();
    fireEvent.click(sendButton!);

    await screen.findByText("Risposta di test");
    expect(screen.getByText("Ciao Horus")).toBeInTheDocument();

    const architectButton = screen.getByRole("button", { name: "Architect" });
    fireEvent.click(architectButton);

    await waitFor(() => {
      expect(screen.queryByText("Ciao Horus")).not.toBeInTheDocument();
      expect(screen.queryByText("Risposta di test")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Scrivi qualcosa")).toBeInTheDocument();
  });

  it("azzera la cronologia anche quando si torna da Architect a Default", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("horus/health")) return healthOkResponse();
      if (url.includes("horus/chat")) {
        return Promise.resolve({
          status: 200,
          ok: true,
          body: makeSseBody([{ event: "done", data: { content: "Risposta in modalità architect" } }]),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as unknown as ReturnType<typeof vi.fn>;

    vi.stubGlobal("fetch", fetchMock);

    renderPanelWithModeSelector();

    const architectButton = await screen.findByRole("button", { name: "Architect" });
    fireEvent.click(architectButton);

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText("Messaggio");
    await user.type(textarea, "Analizza il progetto");
    const buttons = screen.getAllByRole("button");
    const sendButton = buttons.find((b) => b.querySelector("svg.lucide-send"));
    expect(sendButton).toBeTruthy();
    fireEvent.click(sendButton!);

    await screen.findByText("Risposta in modalità architect");
    expect(screen.getByText("Analizza il progetto")).toBeInTheDocument();

    const defaultButton = screen.getByRole("button", { name: "Default" });
    fireEvent.click(defaultButton);

    await waitFor(() => {
      expect(screen.queryByText("Analizza il progetto")).not.toBeInTheDocument();
      expect(screen.queryByText("Risposta in modalità architect")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Scrivi qualcosa")).toBeInTheDocument();
  });

  it("NON azzera la cronologia se showModeSelector è false e si clicca in qualche modo un cambio di modalità", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("horus/health")) return healthOkResponse();
      if (url.includes("horus/chat")) {
        return Promise.resolve({
          status: 200,
          ok: true,
          body: makeSseBody([{ event: "done", data: { content: "Messaggio senza selector" } }]),
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
        emptyStateText="Scrivi qualcosa"
        placeholderText="Messaggio"
        agentName="horus"
        showModeSelector={false}
      />
    );

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText("Messaggio");
    await user.type(textarea, "Domanda senza selector");
    const buttons = screen.getAllByRole("button");
    const sendButton = buttons.find((b) => b.querySelector("svg.lucide-send"));
    expect(sendButton).toBeTruthy();
    fireEvent.click(sendButton!);

    await screen.findByText("Messaggio senza selector");
    expect(screen.getByText("Domanda senza selector")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Architect" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Default" })).not.toBeInTheDocument();

    expect(screen.getByText("Domanda senza selector")).toBeInTheDocument();
    expect(screen.getByText("Messaggio senza selector")).toBeInTheDocument();
  });
});
