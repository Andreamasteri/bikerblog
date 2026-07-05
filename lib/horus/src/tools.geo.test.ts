import assert from "node:assert/strict";
import { test } from "node:test";
import { executeHorusTool, getHorusTools } from "./tools.js";

/**
 * Copertura di regressione per i tool geo/STT su TC introdotti in Fase 2e
 * (Task #198): `geocode_place` (Nominatim), `route_directions` (Valhalla) e
 * `transcribe_audio` (Whisper). Garanzie critiche, sullo stesso modello del
 * test di Nadir:
 *  1. `getHorusTools()` espone ciascun tool SOLO quando il rispettivo *_URL è
 *     impostato (altrimenti il tool sarebbe visibile senza servizio dietro);
 *  2. gli executor mappano i casi di errore a testo amichevole invece di
 *     lanciare (non configurato, errore HTTP del servizio, richiesta interrotta);
 *  3. le chiamate reali colpiscono l'endpoint atteso con i giusti header/param.
 *
 * File separato di proposito: node --test isola ogni file in un processo, così
 * qui l'ambiente resta pulito (nessuna interferenza dagli altri servizi TC).
 */

const REAL = {
  nominatim: process.env["NOMINATIM_URL"],
  nominatimToken: process.env["NOMINATIM_GATE_TOKEN"],
  valhalla: process.env["VALHALLA_URL"],
  valhallaToken: process.env["VALHALLA_GATE_TOKEN"],
  whisper: process.env["WHISPER_URL"],
  whisperToken: process.env["WHISPER_GATE_TOKEN"],
};

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function restoreEnv(): void {
  setEnv("NOMINATIM_URL", REAL.nominatim);
  setEnv("NOMINATIM_GATE_TOKEN", REAL.nominatimToken);
  setEnv("VALHALLA_URL", REAL.valhalla);
  setEnv("VALHALLA_GATE_TOKEN", REAL.valhallaToken);
  setEnv("WHISPER_URL", REAL.whisper);
  setEnv("WHISPER_GATE_TOKEN", REAL.whisperToken);
}

test("getHorusTools gates each geo/STT tool on its own *_URL", async (t) => {
  t.after(restoreEnv);

  // Nessun URL → nessuno dei tre tool compare.
  setEnv("NOMINATIM_URL", undefined);
  setEnv("VALHALLA_URL", undefined);
  setEnv("WHISPER_URL", undefined);
  let names = (await getHorusTools()).map((tool) => tool.function.name);
  assert.ok(!names.includes("geocode_place"), "geocode_place must be hidden without NOMINATIM_URL");
  assert.ok(!names.includes("route_directions"), "route_directions must be hidden without VALHALLA_URL");
  assert.ok(!names.includes("transcribe_audio"), "transcribe_audio must be hidden without WHISPER_URL");

  // Ogni URL abilita esattamente il suo tool.
  setEnv("NOMINATIM_URL", "https://nominatim.example.test");
  names = (await getHorusTools()).map((tool) => tool.function.name);
  assert.ok(names.includes("geocode_place"), "geocode_place must appear with NOMINATIM_URL");
  assert.ok(!names.includes("route_directions"), "route_directions still hidden without VALHALLA_URL");

  setEnv("VALHALLA_URL", "https://valhalla.example.test");
  setEnv("WHISPER_URL", "https://whisper.example.test");
  names = (await getHorusTools()).map((tool) => tool.function.name);
  assert.ok(names.includes("route_directions"), "route_directions must appear with VALHALLA_URL");
  assert.ok(names.includes("transcribe_audio"), "transcribe_audio must appear with WHISPER_URL");
});

test("geocode_place returns the friendly not-configured string when NOMINATIM_URL is unset", async (t) => {
  t.after(restoreEnv);
  setEnv("NOMINATIM_URL", undefined);

  let fetchCalled = false;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCalled = true;
    return new Response("[]", { status: 200 });
  });

  const result = await executeHorusTool("geocode_place", { query: "Passo dello Stelvio" });
  assert.match(result, /non configurat/i);
  assert.equal(fetchCalled, false, "must not hit the network when not configured");
});

test("geocode_place calls /search with the gate header and formats the results", async (t) => {
  t.after(restoreEnv);
  setEnv("NOMINATIM_URL", "https://nominatim.example.test");
  setEnv("NOMINATIM_GATE_TOKEN", "nominatim-gate-token");

  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify([{ display_name: "Passo dello Stelvio, Italia", lat: "46.5", lon: "10.45", type: "mountain_pass" }]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  const result = await executeHorusTool("geocode_place", { query: "Stelvio", language: "en" });
  assert.match(result, /Passo dello Stelvio/);
  assert.match(result, /46\.5/);
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.match(call.url, /\/search\?q=Stelvio/);
  assert.match(call.url, /accept-language=en/);
  const headers = call.init?.headers as Record<string, string>;
  assert.equal(headers["X-Nominatim-Gate-Token"], "nominatim-gate-token");
});

test("route_directions parses lat,lon inputs, posts to /route, and summarizes", async (t) => {
  t.after(restoreEnv);
  setEnv("VALHALLA_URL", "https://valhalla.example.test");
  setEnv("VALHALLA_GATE_TOKEN", "valhalla-gate-token");
  // Coordinate esplicite → nessuna chiamata a Nominatim.
  setEnv("NOMINATIM_URL", undefined);

  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ trip: { summary: { length: 120.5, time: 5400 } } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const result = await executeHorusTool("route_directions", {
    from: "46.5,10.45",
    to: "45.4,9.19",
    costing: "motorcycle",
  });

  assert.match(result, /120\.5 km/);
  assert.match(result, /1h 30min/);
  assert.match(result, /in moto/);
  assert.equal(calls.length, 1, "with explicit coords, only Valhalla is called");
  const call = calls[0]!;
  assert.match(call.url, /\/route$/);
  assert.equal(call.init?.method, "POST");
  const headers = call.init?.headers as Record<string, string>;
  assert.equal(headers["X-Valhalla-Gate-Token"], "valhalla-gate-token");
  const body = JSON.parse(String(call.init?.body));
  assert.equal(body.costing, "motorcycle");
  assert.deepEqual(body.locations, [
    { lat: 46.5, lon: 10.45 },
    { lat: 45.4, lon: 9.19 },
  ]);
});

test("route_directions geocodes place-name inputs via Nominatim first", async (t) => {
  t.after(restoreEnv);
  setEnv("VALHALLA_URL", "https://valhalla.example.test");
  setEnv("NOMINATIM_URL", "https://nominatim.example.test");

  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL) => {
    const u = String(url);
    urls.push(u);
    if (u.includes("nominatim")) {
      return new Response(JSON.stringify([{ lat: "46.5", lon: "10.45", display_name: "Stelvio" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ trip: { summary: { length: 10, time: 600 } } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const result = await executeHorusTool("route_directions", { from: "Stelvio", to: "Bormio" });
  assert.match(result, /10\.0 km/);
  // 2 geocoding (from+to) + 1 route
  assert.equal(urls.filter((u) => u.includes("nominatim")).length, 2);
  assert.equal(urls.filter((u) => u.includes("valhalla")).length, 1);
});

test("route_directions reports a friendly error when a place name can't be geocoded (no Nominatim)", async (t) => {
  t.after(restoreEnv);
  setEnv("VALHALLA_URL", "https://valhalla.example.test");
  setEnv("NOMINATIM_URL", undefined);

  t.mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ trip: { summary: { length: 1, time: 1 } } }), { status: 200 }),
  );

  const result = await executeHorusTool("route_directions", { from: "Stelvio", to: "45.4,9.19" });
  assert.match(result, /Partenza/);
  assert.match(result, /Nominatim non è configurato/i);
});

test("transcribe_audio downloads the audio then posts it to /asr with an explicit language (never auto-detect)", async (t) => {
  t.after(restoreEnv);
  setEnv("WHISPER_URL", "https://whisper.example.test");
  setEnv("WHISPER_GATE_TOKEN", "whisper-gate-token");
  // L'audioUrl deve stare nell'allowlist SSRF = host dell'AI Hub configurato.
  setEnv("AI_HUB_URL", "https://hub.example.test");

  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    // First call = audio download; second = Whisper /asr (returns plain text).
    if (calls.length === 1) {
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    }
    return new Response("  ciao dal passo dello stelvio  ", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  });

  const result = await executeHorusTool("transcribe_audio", {
    audioUrl: "https://hub.example.test/nota.mp3",
    language: "it",
  });

  assert.equal(result, "ciao dal passo dello stelvio");
  assert.equal(calls.length, 2);

  // 1) audio download dall'host in allowlist, con le credenziali CF inoltrate
  assert.equal(calls[0]!.url, "https://hub.example.test/nota.mp3");

  // 2) Whisper /asr: language + task in the query, audio as multipart body
  const asr = calls[1]!;
  assert.match(asr.url, /\/asr\?/);
  const asrQuery = new URL(asr.url).searchParams;
  assert.equal(asrQuery.get("language"), "it");
  assert.equal(asrQuery.get("task"), "transcribe");
  assert.equal(asr.init?.method, "POST");
  const headers = asr.init?.headers as Record<string, string>;
  assert.equal(headers["X-Whisper-Gate-Token"], "whisper-gate-token");
  assert.ok(asr.init?.body instanceof FormData, "body must be multipart FormData");
  assert.ok((asr.init?.body as FormData).has("audio_file"), "FormData must carry audio_file");
});

test("transcribe_audio rejects SSRF-prone audioUrl before any fetch (non-https, IP/loopback, off-allowlist)", async (t) => {
  t.after(restoreEnv);
  setEnv("WHISPER_URL", "https://whisper.example.test");
  setEnv("AI_HUB_URL", "https://hub.example.test");

  let fetchCalled = false;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCalled = true;
    return new Response("should not be reached", { status: 200 });
  });

  const blocked = [
    "http://hub.example.test/nota.mp3", // non-https
    "https://127.0.0.1/nota.mp3", // loopback literal
    "https://169.254.169.254/latest/meta-data", // link-local metadata endpoint
    "https://10.0.0.5/nota.mp3", // private range literal
    "https://localhost/nota.mp3", // localhost
    "https://evil.example.com/nota.mp3", // valid https but off-allowlist
  ];

  for (const audioUrl of blocked) {
    const result = await executeHorusTool("transcribe_audio", { audioUrl, language: "it" });
    assert.match(result, /Impossibile scaricare l'audio/, `expected rejection for ${audioUrl}`);
    assert.equal(fetchCalled, false, `no fetch must happen for ${audioUrl}`);
  }
});

test("transcribe_audio requires an audio reference", async (t) => {
  t.after(restoreEnv);
  setEnv("WHISPER_URL", "https://whisper.example.test");

  let fetchCalled = false;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  });

  const result = await executeHorusTool("transcribe_audio", { language: "it" });
  assert.match(result, /audioUrl/);
  assert.equal(fetchCalled, false);
});

test("geo/STT executors map HTTP errors to friendly strings (no throw)", async (t) => {
  t.after(restoreEnv);
  setEnv("VALHALLA_URL", "https://valhalla.example.test");
  setEnv("NOMINATIM_URL", undefined);

  t.mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ error: "no route found" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }),
  );

  const result = await executeHorusTool("route_directions", { from: "0,0", to: "1,1" });
  assert.match(result, /errore/i);
  assert.match(result, /400/);
  assert.match(result, /no route found/);
});
