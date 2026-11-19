import fs from "node:fs";

const workerPath = process.argv[2] ?? "deploy/bikerblog-live/worker.mjs";
const sectionTitle = "## Commento non richiesto dalla redazione";

const preferredOccurrences = new Map([
  ["> Quebracho: «Bau». Annotazione tecnica: parere espresso senza conflitti di dipendenza.", "diario-2026-04-26"],
  ["> Mendo: «Un altro test?» Rei: «Ne vuoi uno che passi oppure uno che dica la verità?»", "diario-2026-06-24"],
  ["> L'Agente: «Non ho dati per dirlo». Nadir: «Io ne ho: il recipiente è vuoto.»", "diario-2026-03-08"],
  ["> Nadir, parente di Galactus: «Non divoro pianeti. Quella è la categoria premium.»", "diario-2026-05-19"],
  ["> Quebracho: «La soluzione è uscire di casa». Prima o poi avrà ragione sul serio.", "diario-2026-08-30"],
  ["> Mendo: «Semplice, vero?» L'Agente: «Nessuno ha pronunciato quella parola in mia presenza.»", "diario-2026-10-15"],
  ["> Rei: «Meglio un errore evidente che un successo immaginario». Mendo: «Mi stai togliendo le piccole gioie.»", "diario-2026-09-30"],
  ["> Nadir: «Rispetto al consumo medio di un reggimento, la mia cena è assolutamente sostenibile.»", "diario-2026-07-24"],
  ["> Nadir: «Il sistema è distribuito. Le crocchette no. Trovo la cosa profondamente ingiusta.»", "diario-2026-11-05"],
]);

function parseDiaryArray(source) {
  const prefix = "ARCHIVE.posts.push(...";
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error("Diary array declaration not found");
  const jsonStart = start + prefix.length;
  const lineEnd = source.indexOf("\n", jsonStart);
  if (lineEnd < 0) throw new Error("Diary array declaration is not line-terminated");
  const line = source.slice(jsonStart, lineEnd).trimEnd();
  if (!line.endsWith("]);")) throw new Error("Diary array JSON terminator not found");
  const json = line.slice(0, -2);
  return { archive: JSON.parse(json), start: jsonStart, end: lineEnd, json };
}

function reviseWorkerSource(source) {
  const { archive: diary, start, end } = parseDiaryArray(source);
  if (!Array.isArray(diary)) throw new Error("Diary archive is not a JSON array");
  const records = [];

  for (const post of diary) {
    const markerIndex = post.content.indexOf(sectionTitle);
    if (markerIndex < 0) continue;
    const rest = post.content.slice(markerIndex + sectionTitle.length).trim();
    const quote = rest.split(/\n\s*\n/, 1)[0].trim();
    if (!quote.startsWith(">")) throw new Error(`Expected a block quote in ${post.slug}`);
    records.push({ post, quote });
  }

  if (diary.length !== 235 || records.length !== 235) {
    throw new Error(`Expected 235 diary entries and aside sections; got ${diary.length} and ${records.length}`);
  }

  const counts = new Map();
  for (const { quote } of records) counts.set(quote, (counts.get(quote) ?? 0) + 1);
  if (counts.size !== 21) throw new Error(`Expected 21 distinct asides; got ${counts.size}`);

  const retained = new Set();
  for (const [quote, count] of counts) {
    if (count === 1) {
      retained.add(`${quote}\0${records.find((record) => record.quote === quote).post.slug}`);
      continue;
    }
    const preferredSlug = preferredOccurrences.get(quote);
    const preferred = records.find((record) => record.quote === quote && record.post.slug === preferredSlug);
    if (!preferred) throw new Error(`No relevant retained occurrence selected for a repeated aside (${count}): ${quote}`);
    retained.add(`${quote}\0${preferredSlug}`);
  }

  let removedRepeatedQuotes = 0;
  for (const { post, quote } of records) {
    const keep = retained.has(`${quote}\0${post.slug}`);
    const fullSection = `${sectionTitle}\n\n${quote}`;
    if (!post.content.includes(fullSection)) throw new Error(`Aside changed while parsing ${post.slug}`);
    post.content = post.content.replace(fullSection, keep ? quote : "");
    if (!keep) removedRepeatedQuotes += 1;
  }

  if (diary.some((post) => post.content.includes(sectionTitle))) {
    throw new Error("Repeated editorial heading remains after the revision");
  }
  const remainingQuotes = diary.reduce((sum, post) => sum + (post.content.match(/^> /gm)?.length ?? 0), 0);
  if (remainingQuotes !== 21) throw new Error(`Expected 21 retained asides; got ${remainingQuotes}`);

  const updatedJson = JSON.stringify(diary);
  const output = `${source.slice(0, start)}${updatedJson});${source.slice(end)}`;
  return { output, removedRepeatedQuotes, retainedQuotes: remainingQuotes, diaryCount: diary.length };
}

const source = fs.readFileSync(workerPath, "utf8");
const result = reviseWorkerSource(source);
fs.writeFileSync(workerPath, result.output);
console.log(JSON.stringify({ workerPath, diaryCount: result.diaryCount, retainedQuotes: result.retainedQuotes, removedRepeatedQuotes: result.removedRepeatedQuotes, repeatedHeadingCount: 0 }));
