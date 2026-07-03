import { HORUS_MODEL, BOWIE_AGENT_NAME, isBowieConfigured } from "@workspace/horus";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const bowieModel = process.env["BOWIE_OLLAMA_MODEL"];
  logger.info(
    {
      horus: `Horus (${HORUS_MODEL})`,
      bowie: isBowieConfigured() ? `${BOWIE_AGENT_NAME} (${bowieModel})` : `${BOWIE_AGENT_NAME} non configurato`,
    },
    "Configurazione agenti Ollama"
  );
});
