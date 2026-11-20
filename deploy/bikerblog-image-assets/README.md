# BikerBlog allowlisted R2 image worker

This Worker serves five editorial images from the private `bikerblog-media` bucket. The bucket itself stays private; the Worker returns only the exact paths listed in `manifest.json`.

| Public path | Private R2 object |
| --- | --- |
| `/assets/road.webp` | `editorial/03_strada_montagna_serie1.webp` |
| `/assets/route.webp` | `editorial/07_itinerario_serie2.webp` |
| `/assets/telemetry.webp` | `editorial/04_telemetria_serie1.webp` |
| `/assets/workshop.webp` | `editorial/26_motore_officina_dettaglio_originale.webp` |
| `/assets/redazione.webp` | `editorial/08_team_serie2.webp` |

The only operational endpoint is `/healthz`. Unsupported paths return 404 and methods other than GET or HEAD return 405. Add a public image by updating both `worker.mjs` and `manifest.json`, then deploy the Worker with its `BLOG_MEDIA` R2 binding. Do not enable the bucket-wide `r2.dev` URL.
