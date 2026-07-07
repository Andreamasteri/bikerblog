import {
  HORUS_MODEL,
  BOWIE_AGENT_NAME,
  isBowieConfigured,
  QUEBRACHO_AGENT_NAME,
  isQuebrachoConfigured,
} from "@workspace/horus";
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

  const horusModel = process.env["HORUS_OLLAMA_MODEL"] ?? HORUS_MODEL;
  const bowieModel = process.env["BOWIE_OLLAMA_MODEL"];
  const quebrachoModel = process.env["QUEBRACHO_OLLAMA_MODEL"];
  logger.info(
    {
      horus: `Horus (${horusModel})`,
      bowie: isBowieConfigured() ? `${BOWIE_AGENT_NAME} (${bowieModel})` : `${BOWIE_AGENT_NAME} non configurato`,
      quebracho: isQuebrachoConfigured()
        ? `${QUEBRACHO_AGENT_NAME} (${quebrachoModel})`
        : `${QUEBRACHO_AGENT_NAME} non configurato`,
    },
    "Configurazione agenti Ollama"
  );
});
