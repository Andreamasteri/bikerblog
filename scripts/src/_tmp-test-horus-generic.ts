import { horusChat } from "./horus-client.js";

const messages = [
  {
    role: "system" as const,
    content:
      "Questa è una conversazione libera con l'utente, non generazione di contenuti per il blog BikerBlog/BikerLink. " +
      "Rispondi come un assistente generico, competente e diretto, sull'argomento che l'utente porta. " +
      "NON riportare la conversazione su BikerLink, sviluppo software, moto o sul blog a meno che sia l'utente stesso a parlarne esplicitamente. " +
      "Se l'utente cambia argomento, seguilo senza forzare collegamenti con BikerLink.",
  },
  { role: "user" as const, content: "Qual è la capitale del Giappone?" },
];

horusChat(messages, { timeoutMs: 90000 })
  .then((r) => { console.log("RISPOSTA:", r); process.exit(0); })
  .catch((e) => { console.error("ERRORE:", e.message); process.exit(1); });
