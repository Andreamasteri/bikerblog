import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HorusChat } from "./horus-chat";
import {
  agentsRegistryJson,
  healthResultJson,
  HORUS_AGENT,
  BOWIE_AGENT,
  QUEBRACHO_AGENT,
} from "../test/agent-fixtures";

const SESSION_KEY = "horus-chat-password";

const HORUS_GREETING =
  "Scrivi un messaggio per iniziare a chattare con Horus.";

function healthOkResponse() {
  return Promise.resolve({
    status: 200,
    ok: true,
    json: async () => healthResultJson({ status: "ok" }),
  });
}

describe("HorusChat - Horus direct-chat greeting", () => {
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

  it("shows a non-empty greeting in the Horus direct-chat empty state", async () => {
    render(<HorusChat />);

    const greeting = await screen.findByText(HORUS_GREETING);
    expect(greeting).toBeInTheDocument();
    expect(greeting.textContent).not.toBe("");
  });

  it("greeting is shown by default without clicking any tab", async () => {
    render(<HorusChat />);

    const greeting = await screen.findByText(HORUS_GREETING);
    expect(greeting).toBeInTheDocument();
  });

  it("greeting contains the expected Italian prompt text", async () => {
    render(<HorusChat />);

    const greeting = await screen.findByText(HORUS_GREETING);
    expect(greeting.textContent).toContain("Scrivi un messaggio");
    expect(greeting.textContent).toContain("Horus");
  });
});
