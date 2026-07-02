/**
 * content-audit — scansiona il contenuto di un post appena generato/pubblicato
 * alla ricerca di termini "vietati" che indicano una fuga di dettagli interni
 * (nomi di tabelle/colonne del DB, SQL grezzo, riferimenti al matching engine,
 * pattern tipo "tipo 3", ecc.).
 *
 * Nato da un audit manuale che ha trovato 4 post con dettagli del matching
 * engine da correggere: senza un controllo automatico, il cron notturno
 * potrebbe ri-introdurre lo stesso problema in silenzio.
 *
 * La lista è volutamente una costante nel codice (facile da versionare e
 * rivedere in PR) — aggiungi/rimuovi pattern qui per aggiornare l'audit.
 */

/**
 * Ogni voce è una RegExp (case-insensitive) o una stringa letterale.
 * Le stringhe vengono confrontate case-insensitive come sottostringa esatta.
 */
export const FORBIDDEN_TERMS: (string | RegExp)[] = [
  // SQL grezzo / query
  /\bSELECT\s+.+\s+FROM\s+\w+/i,
  /\bINSERT\s+INTO\s+\w+/i,
  /\bUPDATE\s+\w+\s+SET\b/i,
  /\bDELETE\s+FROM\s+\w+/i,
  /\bDROP\s+TABLE\b/i,
  /\bCREATE\s+TABLE\b/i,
  /\bALTER\s+TABLE\b/i,
  /\bJOIN\s+\w+\s+ON\b/i,
  /\bGROUP\s+BY\b/i,
  /\bORDER\s+BY\s+\w+/i,
  /\bWHERE\s+\w+\s*=\s*/i,
  /\bLEAST\s*\(/i,
  /\bGREATEST\s*\(/i,
  /::\s*(text|int|jsonb|timestamp|boolean)\b/i,
  /\bpg_\w+\b/i,
  /\binformation_schema\b/i,

  // Pattern generico "tipo N" (es. "tipo 3", "tipo 12") usato internamente
  // per classificare entità nel matching engine
  /\btipo\s+\d+\b/i,

  // Terminologia interna del matching engine / task tracking di BikerLink
  /\bmatching[\s_-]?engine\b/i,
  /\btask[\s_-]?meta\b/i,
  /\bbikerlink[_-]?tasks?\b/i,
  /\bcluster[_-]?id\b/i,
  /\bsession[_-]?id\b/i,
  /\btask[_-]?id\b/i,

  // Nomi di tabelle/colonne interne del DB di questo progetto
  /\bposts_table\b/i,
  /\bauthors_table\b/i,
  /\bcomments_table\b/i,
  /\bpost_likes\b/i,
  /\bcover_image_url\b/i,
  /\bpublished_at\b/i,
  /\breading_minutes\b/i,
  /\baudio_url\b/i,
  /\bbody_en\b/i,
  /\bauthor_id\b/i,
];

export interface AuditResult {
  flagged: boolean;
  matches: string[];
}

/** Scansiona un testo libero e ritorna i termini vietati trovati. */
export function auditContent(text: string): AuditResult {
  const matches: string[] = [];
  for (const term of FORBIDDEN_TERMS) {
    if (typeof term === "string") {
      if (text.toLowerCase().includes(term.toLowerCase())) {
        matches.push(term);
      }
      continue;
    }
    const found = text.match(term);
    if (found) matches.push(found[0]);
  }
  return { flagged: matches.length > 0, matches };
}

/** Scansiona i campi testuali principali di un post prima della pubblicazione. */
export function auditPost(fields: {
  title: string;
  excerpt: string;
  content: string;
}): AuditResult {
  return auditContent(
    [fields.title, fields.excerpt, fields.content].join("\n\n"),
  );
}
