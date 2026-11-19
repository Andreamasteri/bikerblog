const ASSETS = Object.freeze({
  "/assets/road.webp": "editorial/03_strada_montagna_serie1.webp",
  "/assets/route.webp": "editorial/07_itinerario_serie2.webp",
  "/assets/telemetry.webp": "editorial/04_telemetria_serie1.webp",
  "/assets/workshop.webp": "editorial/26_motore_officina_dettaglio_originale.webp",
  "/assets/redazione.webp": "editorial/08_team_serie2.webp",
});

const commonHeaders = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=604800, stale-while-revalidate=86400",
  "cross-origin-resource-policy": "cross-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

function reply(body, status, headers = {}) {
  return new Response(body, { status, headers: { ...commonHeaders, ...headers } });
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return reply("Method not allowed", 405, { allow: "GET, HEAD" });
    }

    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return reply(JSON.stringify({ status: "ok", publicAssets: Object.keys(ASSETS).length }), 200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
    }

    const key = ASSETS[url.pathname];
    if (!key) return reply("Not found", 404, { "content-type": "text/plain; charset=utf-8" });

    const object = await env.BLOG_MEDIA.get(key);
    if (!object) return reply("Not found", 404, { "content-type": "text/plain; charset=utf-8" });

    const headers = new Headers(commonHeaders);
    headers.set("content-type", object.httpMetadata?.contentType || "image/webp");
    if (object.httpEtag) headers.set("etag", object.httpEtag);
    if (object.uploaded) headers.set("last-modified", object.uploaded.toUTCString());

    return new Response(request.method === "HEAD" ? null : object.body, {
      status: 200,
      headers,
    });
  },
};
