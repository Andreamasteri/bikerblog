// BikerBlog live cover image patch for Cloudflare Worker 'bikerblog-recovery'.
// Applies to the CURRENT deployed Worker source, not a stale repository snapshot.
// The 25 historical editorial assignments are in editorial-media-manifest.json.
// Six additional UNIQUE pictures replace the geometric cards shown on Nov 12-17.
// Other cards keep the current layout/fallback. R2 media remain isolated/private.

export const additionalLiveCovers = {
  "diario-2026-11-17": "/media/editorial/12_team_serie3.webp",
  "diario-2026-11-16": "/media/editorial/24_telemetria_serie6.webp",
  "diario-2026-11-15": "/media/editorial/13_laboratorio_elettronico_serie4.webp",
  "diario-2026-11-14": "/media/editorial/10_strada_montagna_serie3.webp",
  "diario-2026-11-13": "/media/editorial/26_motore_officina_dettaglio_originale.webp",
  "diario-2026-11-12": "/media/editorial/01_motore_serie1.webp"
};

export const patchBikerblogWorker = (source, assignments) => {
  if (typeof source !== "string" || source.length < 100000) throw Error("unexpected live Worker source");
  if (source.includes("const EDITORIAL_COVERS=")) throw Error("editorial covers already patched");
  if (Object.keys(assignments).length !== 31 || new Set(Object.values(assignments)).size !== 31) throw Error("cover assignment count/uniqueness mismatch");
  const coverAnchor = "function coverFor(p){";
  const allowAnchor = 'if(!allow.includes(mediaKey))return new Response("Not found",{status:404});';
  if (source.split(coverAnchor).length !== 2 || source.split(allowAnchor).length !== 2) throw Error("live Worker structure changed");
  const coverTable = "const EDITORIAL_COVERS=" + JSON.stringify(assignments) + ";\n";
  const newCoverFor = coverTable + 'function coverFor(p){\n if(Object.prototype.hasOwnProperty.call(EDITORIAL_COVERS,p.slug))return EDITORIAL_COVERS[p.slug];';
  const newAllow = 'if(!(allow.includes(mediaKey)||/^editorial\\/[A-Za-z0-9_-]+\\.webp$/.test(mediaKey)))return new Response("Not found",{status:404});';
  return source.replace(coverAnchor, newCoverFor).replace(allowAnchor, newAllow);
};
