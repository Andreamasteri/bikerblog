import assert from "node:assert/strict";
import { test } from "node:test";
import type { HorusToolSpec } from "@workspace/horus";
import { tryParseTextualToolCall } from "./horus.js";

/**
 * Regressione: Bowie (llama3.2:3b) non supporta in modo affidabile il
 * function-calling nativo di Ollama e a volte scrive il JSON della tool call
 * direttamente nel testo della risposta invece di emettere un vero
 * `tool_calls` (bug osservato in produzione: l'utente vedeva il JSON grezzo
 * `{"name": "remember_note", "parameters": {...}}` come se fosse la risposta
 * finale). `tryParseTextualToolCall` deve intercettare questo pattern e
 * convertirlo in una tool_call reale, ma solo quando il nome corrisponde a un
 * tool effettivamente disponibile.
 */

const TOOLS: HorusToolSpec[] = [
  {
    type: "function",
    function: {
      name: "remember_note",
      description: "test",
      parameters: { type: "object", properties: {} },
    },
  },
];

test("parses a textual tool-call JSON blob into a real tool call", () => {
  const content =
    '{"name": "remember_note", "parameters": {"note": "Sono offline e non rispondo immediatamente"}}';
  const result = tryParseTextualToolCall(content, TOOLS);
  assert.ok(result);
  assert.equal(result?.length, 1);
  assert.equal(result?.[0]?.function.name, "remember_note");
  assert.deepEqual(result?.[0]?.function.arguments, {
    note: "Sono offline e non rispondo immediatamente",
  });
});

test("also accepts an 'arguments' key instead of 'parameters'", () => {
  const content = '{"name": "remember_note", "arguments": {"note": "test"}}';
  const result = tryParseTextualToolCall(content, TOOLS);
  assert.equal(result?.[0]?.function.name, "remember_note");
});

test("ignores plain text that happens to contain braces but no tool name", () => {
  const content = "Certo! Ecco un esempio di oggetto JS: { chiave: valore }";
  assert.equal(tryParseTextualToolCall(content, TOOLS), null);
});

test("ignores a JSON blob naming a tool that isn't in the available list", () => {
  const content = '{"name": "delete_everything", "parameters": {}}';
  assert.equal(tryParseTextualToolCall(content, TOOLS), null);
});

test("returns null for a normal conversational reply", () => {
  const content = "Ciao! Sono operativo e pronto ad aiutarti.";
  assert.equal(tryParseTextualToolCall(content, TOOLS), null);
});
