#!/usr/bin/env tsx
/**
 * notify-test — invia un alert di prova sui canali configurati per
 * verificare la configurazione (RESEND_API_KEY/PIPELINE_ALERT_EMAIL_TO,
 * PIPELINE_ALERT_SLACK_WEBHOOK_URL, PIPELINE_ALERT_TELEGRAM_BOT_TOKEN/
 * PIPELINE_ALERT_TELEGRAM_CHAT_ID).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run pipeline:notify-test
 */
import { sendPipelineAlert } from "./notify.js";

const result = await sendPipelineAlert({
  date: new Date().toISOString().slice(0, 10),
  reason: "TEST — messaggio di prova",
  failedSteps: ["esempio step"],
  postsPublished: 0,
  audioGenerated: 0,
  translationsDone: 0,
  errors: ["Questo è un errore di esempio per verificare la notifica"],
  warnings: [],
});

console.log(`[notify-test] canali configurati: ${result.configured}, inviati con successo: ${result.sent}`);

if (result.configured === 0) {
  process.exit(1);
}
