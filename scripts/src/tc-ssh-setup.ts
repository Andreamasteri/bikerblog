import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";

// .local/ persists across agent sessions (unlike /tmp, which is wiped each
// session) and is already gitignored, so the key only needs to be written
// once per repl lifetime instead of once per session.
const KEY_DEST = resolve(import.meta.dirname, "../../.local/tc_ssh/key");

const HEADER = "-----BEGIN OPENSSH PRIVATE KEY-----";
const FOOTER = "-----END OPENSSH PRIVATE KEY-----";

/**
 * TC_SSH_KEY is stored with its newlines collapsed into single spaces
 * (an artifact of how the secret was originally pasted/set). This
 * reconstructs a valid OpenSSH private key file:
 *   - header and footer are multi-word strings, so we protect them first
 *   - every remaining space is a line break between base64 body chunks
 */
export function reconstructKey(raw: string): string {
  const trimmed = raw.trim();

  if (!trimmed.includes(HEADER) || !trimmed.includes(FOOTER)) {
    throw new Error(
      "TC_SSH_KEY non contiene i marker BEGIN/END attesi di una chiave OpenSSH — controlla il secret.",
    );
  }

  const withoutHeader = trimmed.slice(HEADER.length, trimmed.length - FOOTER.length).trim();

  const bodyLines = withoutHeader.split(/\s+/).filter(Boolean);

  return [HEADER, ...bodyLines, FOOTER].join("\n") + "\n";
}

function main() {
  const raw = process.env.TC_SSH_KEY;
  if (!raw) {
    console.error("[tc-ssh-setup] TC_SSH_KEY non impostata come secret.");
    process.exit(1);
  }

  const keyContent = reconstructKey(raw);

  mkdirSync(dirname(KEY_DEST), { recursive: true });
  writeFileSync(KEY_DEST, keyContent, { mode: 0o600 });
  chmodSync(KEY_DEST, 0o600);

  console.log(`[tc-ssh-setup] Chiave scritta in ${KEY_DEST} (${keyContent.split("\n").length - 1} righe).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
