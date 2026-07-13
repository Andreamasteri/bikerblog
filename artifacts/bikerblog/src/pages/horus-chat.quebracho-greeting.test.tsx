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

const QUEBRACHO_GREETING =
  "Qq: «Bentornato. Sono sempre contento di vederti. Usciamo?»";

function healthOkResponse() {
  return Promise.resolve({
    status: 200,
    ok: true,
    json: async () => healthResultJson({ status: "ok" }),
  });
}

describe("HorusChat - Quebracho direct-chat greeting", () => {
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

  it("shows a non-empty greeting in the Quebracho direct-chat empty state", async () => {
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Chat con Quebracho/i }));

    const greeting = await screen.findByText(QUEBRACHO_GREETING);
    expect(greeting).toBeInTheDocument();
    expect(greeting.textContent).not.toBe("");
  });

  it("greeting contains the expected Italian salutation", async () => {
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Chat con Quebracho/i }));

    const greeting = await screen.findByText(QUEBRACHO_GREETING);
    expect(greeting.textContent).toContain("Bentornato");
    expect(greeting.textContent).toContain("Usciamo");
  });

  it("greeting starts with the Quebracho identifier prefix 'Qq:'", async () => {
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Chat con Quebracho/i }));

    const greeting = await screen.findByText(QUEBRACHO_GREETING);
    expect(greeting.textContent?.trimStart()).toMatch(/^Qq:/);
  });
});
