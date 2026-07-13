import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HorusChat } from "./horus-chat";
import {
  agentsRegistryJson,
  healthResultJson,
  HORUS_AGENT,
  BOWIE_AGENT,
} from "../test/agent-fixtures";

const SESSION_KEY = "horus-chat-password";

function healthOkResponse() {
  return Promise.resolve({
    status: 200,
    ok: true,
    json: async () => healthResultJson({ status: "ok" }),
  });
}

describe("HorusChat - group-conversation greeting", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.setItem(SESSION_KEY, "test-password");

    fetchMock = vi.fn((url: string) => {
      if (url.includes("horus/agents")) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => agentsRegistryJson([HORUS_AGENT, BOWIE_AGENT]),
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

  it("shows the group-conversation intro text when the Horus ↔ Bowie tab is opened", async () => {
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Horus ↔ Bowie/i }));

    const introText = await screen.findByText(
      /Proponi un argomento e guarda .+ discuterne a turni\./i
    );
    expect(introText).toBeInTheDocument();
    expect(introText.textContent).not.toBe("");
  });

  it("includes both agent names in the group-conversation intro copy", async () => {
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Horus ↔ Bowie/i }));

    const introText = await screen.findByText(
      /Proponi un argomento e guarda .+ discuterne a turni\./i
    );
    expect(introText.textContent).toContain("Horus");
    expect(introText.textContent).toContain("Bowie");
  });

  it("shows the topic input placeholder that names the conversation participants", async () => {
    render(<HorusChat />);

    fireEvent.click(await screen.findByRole("button", { name: /Horus ↔ Bowie/i }));

    const topicInput = await screen.findByPlaceholderText(
      /Argomento della discussione tra .+\.\.\./i
    );
    expect(topicInput).toBeInTheDocument();
    expect(topicInput.getAttribute("placeholder")).not.toBe("");
  });
});
