/**
 * notify — invia una notifica quando la pipeline notturna fallisce o non
 * pubblica nulla di inaspettato. Silenzioso in caso di successo (chi chiama
 * decide quando invocare `sendPipelineAlert`).
 *
 * Canali supportati (tutti opzionali, configurabili via env — vengono
 * inviati a tutti i canali configurati, non solo al primo):
 *   - Email via Resend:   RESEND_API_KEY, PIPELINE_ALERT_EMAIL_TO
 *                         (opzionale: PIPELINE_ALERT_EMAIL_FROM, default "BikerBlog Pipeline <onboarding@resend.dev>")
 *   - Slack (incoming webhook): PIPELINE_ALERT_SLACK_WEBHOOK_URL
 *   - Telegram bot:       PIPELINE_ALERT_TELEGRAM_BOT_TOKEN, PIPELINE_ALERT_TELEGRAM_CHAT_ID
 *
 * Se nessun canale è configurato, la funzione logga un avviso e non fa nulla
 * (non solleva errori — un alert mancante non deve mai far fallire la pipeline).
 */

export interface PipelineAlertInfo {
  date: string;
  reason: string;
  failedSteps: string[];
  postsPublished: number;
  audioGenerated: number;
  translationsDone: number;
  errors: string[];
  warnings: string[];
}

function buildMessage(info: PipelineAlertInfo): { subject: string; text: string } {
  const subject = `[BikerBlog] Pipeline notturna ${info.reason} — ${info.date}`;
  const lines = [
    `Data: ${info.date}`,
    `Motivo: ${info.reason}`,
    `Post pubblicati: ${info.postsPublished}`,
    `Audio generati: ${info.audioGenerated}`,
    `Traduzioni completate: ${info.translationsDone}`,
  ];
  if (info.failedSteps.length > 0) {
    lines.push(`Step falliti: ${info.failedSteps.join(", ")}`);
  }
  if (info.errors.length > 0) {
    lines.push("", "Errori:", ...info.errors.map((e) => `  - ${e}`));
  }
  if (info.warnings.length > 0) {
    lines.push("", "Warning:", ...info.warnings.map((w) => `  - ${w}`));
  }
  return { subject, text: lines.join("\n") };
}

async function sendEmailViaResend(subject: string, text: string): Promise<string | null> {
  const apiKey = process.env["RESEND_API_KEY"];
  const to = process.env["PIPELINE_ALERT_EMAIL_TO"];
  if (!apiKey || !to) return null;
  const from = process.env["PIPELINE_ALERT_EMAIL_FROM"] || "BikerBlog Pipeline <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return `Resend email failed: HTTP ${res.status} ${body}`;
    }
    return null;
  } catch (err) {
    return `Resend email failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function sendSlackWebhook(text: string): Promise<string | null> {
  const url = process.env["PIPELINE_ALERT_SLACK_WEBHOOK_URL"];
  if (!url) return null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return `Slack webhook failed: HTTP ${res.status} ${body}`;
    }
    return null;
  } catch (err) {
    return `Slack webhook failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function sendTelegramMessage(text: string): Promise<string | null> {
  const botToken = process.env["PIPELINE_ALERT_TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["PIPELINE_ALERT_TELEGRAM_CHAT_ID"];
  if (!botToken || !chatId) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return `Telegram message failed: HTTP ${res.status} ${body}`;
    }
    return null;
  } catch (err) {
    return `Telegram message failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Invia l'alert a tutti i canali configurati. Ritorna il numero di canali
 * a cui l'invio è riuscito e logga eventuali fallimenti di invio (senza
 * mai lanciare — un problema di notifica non deve mai bloccare la pipeline).
 */
export async function sendPipelineAlert(info: PipelineAlertInfo): Promise<{ sent: number; configured: number }> {
  const { subject, text } = buildMessage(info);

  const channels: Array<Promise<string | null>> = [];
  let configured = 0;

  if (process.env["RESEND_API_KEY"] && process.env["PIPELINE_ALERT_EMAIL_TO"]) {
    configured++;
    channels.push(sendEmailViaResend(subject, text));
  }
  if (process.env["PIPELINE_ALERT_SLACK_WEBHOOK_URL"]) {
    configured++;
    channels.push(sendSlackWebhook(text));
  }
  if (process.env["PIPELINE_ALERT_TELEGRAM_BOT_TOKEN"] && process.env["PIPELINE_ALERT_TELEGRAM_CHAT_ID"]) {
    configured++;
    channels.push(sendTelegramMessage(text));
  }

  if (configured === 0) {
    console.warn(
      "[notify] Nessun canale di notifica configurato (RESEND_API_KEY+PIPELINE_ALERT_EMAIL_TO, " +
      "PIPELINE_ALERT_SLACK_WEBHOOK_URL o PIPELINE_ALERT_TELEGRAM_BOT_TOKEN+PIPELINE_ALERT_TELEGRAM_CHAT_ID) " +
      "— alert non inviato."
    );
    return { sent: 0, configured: 0 };
  }

  const results = await Promise.all(channels);
  const failures = results.filter((r): r is string => r !== null);
  const sent = configured - failures.length;

  for (const failure of failures) {
    console.error("[notify]", failure);
  }
  console.log(`[notify] alert inviato a ${sent}/${configured} canale/i configurato/i`);

  return { sent, configured };
}
