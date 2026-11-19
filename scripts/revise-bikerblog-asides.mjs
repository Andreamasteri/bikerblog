import fs from "node:fs";

const workerPath = process.argv[2] ?? "deploy/bikerblog-live/worker.mjs";
const prefix = "ARCHIVE.posts.push(...";

const commentsByTopic = {
  "build e versioni": [
    "> Mendo: «Build pronta?» Rei: «Sul dispositivo, prima di chiamarla pronta.»",
    "> Nadir: «L’etichetta è cambiata; la coperta, per fortuna, no.»",
    "> Quebracho ha controllato la ventola a distanza di sicurezza. Test olfattivo superato.",
    "> Una versione scritta sullo schermo è una promessa; il telefono chiede ricevuta.",
    "> Rei: «Ho annotato l’hash. Ora vediamo se anche l’app lo riconosce.»",
    "> Mendo: «È l’ultima?» Nadir: «Fino al prossimo riavvio, immagino.»",
    "> La release ideale di Nadir è quella che non interrompe il riposo.",
    "> L’Agente: «Compilato.» Rei: «Bene, adesso apriamolo davvero.»",
    "> Quebracho guarda la barra di caricamento; la coda si muove più in fretta.",
    "> Nadir si tiene il posto vicino alla ventola: almeno qualcuno ha una strategia di raffreddamento.",
    "> Il numero di build sale; la prudenza resta sulla stessa versione.",
    "> Rei: «Il pacchetto è arrivato. Ora controlliamo cosa contiene.»",
    "> Mendo apre il log. Nadir apre un occhio: priorità diverse, metodo simile.",
    "> Nel garage, «rilasciato» è un verbo; «verificato» è una seconda visita.",
    "> Quebracho: «Bau». Traduzione: non si festeggia prima dell’avvio.",
    "> Nadir: «La rotazione delle versioni è interessante. Quella della ciotola è urgente.»",
    "> Rei: «Un aggiornamento ha senso solo se sappiamo da dove parte.»",
    "> Mendo: «Funziona sul mio?» L’Agente: «Dimmi quale build hai installato.»",
    "> Il pacchetto pesa megabyte; la pazienza del garage si misura in minuti.",
    "> Nadir concede il passaggio alla nuova versione, previo controllo del cuscino.",
    "> L’Agente: «Versione aggiornata.» Rei: «E il codice in esecuzione?»",
    "> Il cavo giusto trova la porta giusta. Quebracho chiama tutto questo fortuna.",
    "> Mendo annota la release; Nadir preferisce il calendario dei pasti.",
    "> Una build non è una medaglia: è l’invito a fare un’altra prova.",
    "> Rei: «Non basta che parta una volta. Facciamole fare il giro completo.»",
    "> Il changelog promette ordine; il garage conserva il diritto di verifica.",
    "> Nadir: «Se la versione è stabile, che resti stabile anche la mia sedia.»",
    "> Mendo guarda il numero. Rei guarda il comportamento. La bilancia è corretta.",
    "> Quebracho ha ignorato la parola «hotfix»; il guinzaglio resta la sua priorità.",
    "> Il build server lavora. In sala pausa, il supervisore non ha chiesto permesso.",
    "> Rei: «Chiudiamo il ciclo solo dopo una prova che possiamo ripetere.»",
  ],
  "interfaccia e design": [
    "> Nadir: «Il pulsante è grande. Finalmente qualcuno pensa anche alle zampe.»",
    "> Mendo: «Qui cosa devo fare?» Rei: «Se serve una spiegazione, il disegno non ha finito.»",
    "> Quebracho segue il contrasto con lo sguardo. La ciotola resta il suo benchmark.",
    "> Un’icona misteriosa è un rebus senza premio; meglio una parola chiara.",
    "> Rei: «La schermata respira meglio. Lasciamole spazio.»",
    "> Nadir ha scelto il riquadro più caldo: test di usabilità felina, non richiesto.",
    "> Il testo piccolo non diventa leggibile per buona volontà; nemmeno per testardaggine.",
    "> Mendo indica il bottone. Nadir indica la sedia. Entrambi sono molto convinti.",
    "> Quebracho ha capito il percorso fino alla porta; per il menu serviva un’etichetta.",
    "> Rei: «Una schermata chiara fa risparmiare domande a tutti.»",
    "> La gerarchia visiva è risolta: Nadir ha comunque scelto il posto in ombra.",
    "> Una mappa di colori non è una mappa mentale. Meglio un’etichetta accanto.",
    "> Mendo: «La capisco io.» Rei: «Proviamo con chi la vede per la prima volta.»",
    "> Lo spazio vuoto qui non manca: sta lasciando leggere quello che conta.",
    "> Nadir approva il pannello opaco: riflette meno luce e più calma.",
    "> Il menu non deve farsi notare; deve trovarsi quando serve.",
    "> Quebracho ha scelto la scorciatoia più diretta, che non era il pulsante decorativo.",
    "> Rei: «Se ogni elemento urla, nessuno riesce a sentire la pagina.»",
    "> Mendo sposta un’etichetta; il garage guadagna una domanda in meno.",
    "> L’interfaccia non è un cruscotto da lucidare: è una strada da rendere leggibile.",
    "> Nadir: «Finalmente niente animazioni mentre sto facendo un pisolino.»",
    "> La prima impressione è semplice; il lavoro che la rende semplice, meno.",
    "> Quebracho ha superato il test più severo: è passato davanti senza fermarsi confuso.",
    "> Rei: «Una buona icona aiuta. Un’etichetta precisa evita l’indovinello.»",
    "> Il layout è più pulito. Nadir continua a chiedere una coperta personale.",
    "> Mendo controlla la schermata alla luce del garage, non solo sul monitor.",
  ],
  "bug e verifiche": [
    "> L’Agente: «Nessun errore.» Rei: «Riprova dopo aver letto il log.»",
    "> Quebracho non abbaia ai bug noti; ha annusato quelli appena arrivati.",
    "> Nadir: «Quel silenzio dopo il deploy mi sembra sospetto.»",
    "> Un errore riprodotto è già più educato: almeno si presenta puntuale.",
    "> Mendo: «È sparito.» Rei: «O non abbiamo riaperto la schermata giusta.»",
    "> Il log non consola, ma almeno non inventa una causa.",
    "> Quebracho controlla il corridoio; il test automatico controlla la porta.",
    "> Nadir ha visto tre persone fissare il terminale; ha dichiarato il bug il più sociale.",
    "> Rei: «Prima la prova che falliva. Poi la correzione. Infine la stessa prova.»",
    "> Una spunta verde dura poco se nessuno sa quale caso ha coperto.",
    "> Mendo torna indietro di un passaggio; il bug smette di sembrare magia.",
    "> Quebracho ha puntato il muso al cavo sbagliato. Per una volta il cavo era innocente.",
    "> L’Agente: «Tutto pulito.» Rei: «Vediamo anche il percorso meno comodo.»",
    "> Nadir: «Avete trovato il colpevole? Io ho già trovato la ciotola.»",
    "> Il bug non legge i titoli dei test; si nasconde nell’angolo fuori campo.",
    "> Mendo: «Passa.» Rei: «Quanto spesso?»",
    "> Un test non è pessimista: ha solo memoria migliore del team.",
    "> Quebracho ha archiviato il rumore del ventilatore; quello del log resta da leggere.",
    "> Rei: «Il caso limite non è un ospite: abita già qui.»",
    "> Nadir sceglie il momento del crash per alzarsi. Coincidenza, secondo lui.",
    "> La correzione è piccola. Il sollievo nel garage ha dimensioni notevoli.",
    "> Mendo: «A me non succede.» Rei: «Ottimo, ripetiamolo sul dispositivo.»",
    "> Quebracho è stato convocato come consulente; ha consegnato una zampa sul report.",
    "> Il bug ha cambiato indirizzo. La verifica deve inseguirlo, non la memoria.",
    "> Nadir: «Ho sentito un sospiro. È un passaggio del test?»",
    "> Un controllo ripetibile vale più di un «stavolta sembra a posto».»",
  ],
  "macchine e infrastruttura": [
    "> Nadir: «Il server è lontano. La sua ciotola, invece, deve stare vicina.»",
    "> Quebracho sorveglia il case; i cavi non hanno passato il controllo d’accesso.",
    "> Il rack è in ordine. Sotto la scrivania regna una topologia più creativa.",
    "> Rei: «Identifichiamo la macchina prima di chiamarla produzione.»",
    "> Mendo ha scritto il nome sul foglio. Il terminale resta da convincere.",
    "> Nadir preferisce i server silenziosi; quella ventola ha un’opinione diversa.",
    "> Un servizio può essere online e comunque nel posto sbagliato.",
    "> Quebracho ha sorvegliato la presa multipla per tutta la riunione.",
    "> La rete è invisibile; il groviglio sotto il tavolo è un diagramma molto visibile.",
    "> Rei: «Prima leggiamo il binding, poi tocchiamo il servizio.»",
    "> Mendo: «Qual è quello attivo?» Nadir: «Quello con la coperta sopra.»",
    "> Un worker non è un garage: se ne vedi due, chiedi quale riceve traffico.",
    "> Il cavo più corto ha risolto il disordine; quello giusto ha risolto la domanda.",
    "> Quebracho alza la testa a ogni riavvio. L’alert a quattro zampe funziona.",
    "> Nadir ha dichiarato zona franca il lato caldo del case.",
    "> Rei: «Un endpoint risponde; ora verifichiamo chi lo sta servendo.»",
    "> Il grafico promette calma. La presa etichettata male suggerisce prudenza.",
    "> Mendo ha fatto l’inventario delle macchine; Nadir quello delle sedie.",
    "> Nessuno chiami «vecchio» un server finché non sappiamo cosa conserva.",
    "> Quebracho ha scambiato il rumore del disco per un nuovo vicino.",
    "> Il garage ha due mappe: quella dei percorsi e quella dei cavi. Entrambe servono.",
    "> Rei: «Il servizio è stabile quando sappiamo come riconoscerne lo stato.»",
  ],
  "database e memoria": [
    "> Nadir: «La memoria lunga va bene; ricordatevi anche il mio orario.»",
    "> Un backup letto non è un ripristino provato; il gatto lo sa senza database.",
    "> Mendo conta le copie. Rei chiede quale sia stata riaperta.",
    "> Quebracho ha nascosto il giocattolo in due posti; nessuno li chiama replica.",
    "> La tabella dimentica meno di noi, ma va controllata lo stesso.",
    "> Nadir ha visto una migrazione e ha chiesto se cambiasse la posizione della ciotola.",
    "> Rei: «Conservare è facile. Ritrovare il dato giusto è il lavoro.»",
    "> Il dato è rimasto. Il contesto va ancora recuperato.",
    "> Mendo: «Abbiamo un backup?» Rei: «Sì. Ora proviamo a usarlo.»",
    "> Quebracho ha annusato la scatola delle copie; dentro non c’era il suo osso.",
    "> La memoria del garage ha tre versioni. Il foglio con le date vince.",
    "> Nadir: «Le righe sono tante. La mia porzione è sempre una sola.»",
    "> Un archivio senza indice è un magazzino dopo il passaggio di Quebracho.",
    "> Rei: «La migrazione ha finito; controlliamo che i vecchi dati siano ancora qui.»",
    "> Mendo verifica prima la lista, poi apre la scatola. Ordine utile anche in cucina.",
    "> Il dato cancellato non torna per senso di colpa. Serve un percorso di recupero.",
    "> Nadir si è appisolato sul backup. Non è una strategia di conservazione approvata.",
  ],
  "mappe e percorsi": [
    "> Quebracho ha annusato la curva prima del GPS. Ha comunque aspettato il segnale.",
    "> Nadir guarda la mappa al contrario: per lui la destinazione è la ciotola.",
    "> La posizione sullo schermo è un indizio; la strada resta fuori dalla finestra.",
    "> Rei: «La freccia mostra una direzione. La scelta resta di chi guida.»",
    "> Mendo ha trovato la strada. Quebracho ha trovato il lato ombreggiato.",
    "> Se il pin cade nel garage, almeno il rientro è semplice.",
    "> La mappa zooma; Nadir mantiene la distanza di sicurezza dal touchscreen.",
    "> Un itinerario bello sulla carta ha ancora bisogno di una strada vera.",
    "> Quebracho: «Bau». Traduzione: quella svolta era più in là.",
    "> Rei: «Controlliamo il punto di partenza prima di discutere il percorso.»",
    "> Il GPS può perdere il nord; Nadir non ha mai perso il tavolo.",
    "> Mendo guarda il percorso intero. Rei controlla dove inizia.",
    "> Una linea blu non è una promessa sul traffico.",
    "> Quebracho ha votato per la sosta. La mappa non prevedeva quorum.",
    "> Nadir ha scelto la strada più breve: dal pouf alla finestra.",
    "> La rotta è chiara; il puntino deve prima trovare casa.",
    "> Rei: «Una buona mappa aiuta. Non sostituisce l’attenzione.»",
  ],
  "agenti ai": [
    "> L’Agente: «So la risposta.» Rei: «Puoi indicare da quale fonte?»",
    "> Nadir: «L’assistente ha parlato. Nessuno ha ordinato la cena.»",
    "> Una risposta convincente non fa le fusa: servono le prove.",
    "> Mendo: «È sicuro?» Rei: «È ciò che stiamo verificando.»",
    "> L’Agente ha chiesto più contesto. Nadir ha chiesto più crocchette.",
    "> Rei: «L’AI aiuta a cercare; la decisione finale resta umana.»",
    "> Quebracho ha ascoltato il modello e poi ha seguito il rumore della porta.",
    "> Nadir ha valutato l’agente: sa trovare il cibo? Esame non superato.",
    "> La risposta generata è una bozza, non una traccia di produzione.",
    "> Mendo aggiunge una regola; Rei aggiunge una verifica.",
    "> L’Agente: «Non ho certezza.» Nadir: «Allora siediti con noi.»",
    "> Il contesto è una ciotola: vuota, la risposta cambia subito.",
    "> Rei preferisce una lacuna dichiarata a un dettaglio inventato.",
    "> Nadir si è messo in mezzo alla demo. Anche lui vuole una revisione umana.",
    "> Un agente sa aiutare; non gli si consegnano le chiavi senza controllo.",
    "> Mendo guarda l’output. Rei controlla la fonte. Nadir controlla l’ora.",
  ],
  "sicurezza e accessi": [
    "> Quebracho controlla il cancello; Rei controlla chi ha la chiave.",
    "> Una porta chiusa a chiave è meglio di un cartello «qui non entrare».",
    "> Nadir ha chiesto i permessi amministrativi. Non gli servono per il divano.",
    "> Mendo: «Possiamo mostrarlo?» Rei: «Prima vediamo a chi lo stiamo mostrando.»",
    "> Il token è un pass, non un souvenir da lasciare sul banco.",
    "> L’Agente: «Il test passa.» Rei: «Anche senza ruolo?»",
    "> La policy sulla carta non ferma nessuno finché un test non la attraversa.",
    "> Quebracho difende l’ingresso; la allowlist evita di dare un guinzaglio a tutti.",
    "> Nadir si è seduto sul post-it con la password. Almeno non la legge nessuno.",
    "> Mendo ha chiuso la porta. Rei controlla anche la finestra digitale.",
    "> Un accesso negato è una risposta sana, anche se il terminale brontola.",
    "> Le chiavi si custodiscono; i segreti non si appendono al portachiavi.",
    "> Rei: «Il privilegio minimo vale anche quando è più scomodo.»",
  ],
  "incontri e matching": [
    "> Mendo: «Un invito basta.» Rei: «Anche due utenti meritano spazio.»",
    "> Quebracho non segue due volte lo stesso fischio: il matching ha un alleato.",
    "> Nadir ha visto un duplicato. Si è comunque presentato due volte a cena.",
    "> Una connessione buona rispetta il no e non insiste con altre notifiche.",
    "> Rei: «Prima controlliamo chi è già stato contattato.»",
    "> Mendo: «Lo proponiamo ancora?» L’Agente: «Solo se la regola lo consente.»",
    "> Quebracho: «Bau». Traduzione: l’invito era già arrivato ieri.",
    "> Il match perfetto per Nadir è quello senza concorrenti alla ciotola.",
    "> Un filtro prudente fa meno rumore e più spazio alla scelta.",
    "> Rei: «Il sistema può suggerire; la persona decide se incontrarsi.»",
  ],
  "telemetria": [
    "> Un numero senza contesto è solo una cifra che ha imparato a stare dritta.",
    "> Nadir ha controllato il contatore del cibo: metrica con soglia chiarissima.",
    "> Mendo: «È salito?» Rei: «Rispetto a quale misura?»",
    "> Un grafico pulito non rende puliti i dati.",
    "> Quebracho segue i passi; la telemetria, se va bene, lascia una traccia verificabile.",
    "> Rei: «Un alert utile spiega la soglia che ha superato.»",
    "> Nadir non è un campione statistico, ma si presenta a ogni misurazione.",
    "> La metrica è attendibile solo quando possiamo risalire alla sua origine.",
    "> Mendo annota l’ora; il grafico smette di sembrare una profezia.",
    "> Prima di reagire al picco, controlliamo cosa ha contato il contatore.",
  ],
  "community e club": [
    "> Quebracho preferisce le presentazioni col naso, ma lascia spazio ai saluti.",
    "> Nadir: «Quanti nuovi utenti?» Mendo: «Quelli veri.» Nadir: «E le porzioni?»",
    "> Una community è una porta aperta, non una stanza da cui non si esce.",
    "> Rei: «Il gruppo funziona quando l’incontro non dipende solo dallo schermo.»",
    "> Mendo organizza le persone; Quebracho organizza la pausa caffè.",
    "> Un club non ha bisogno di notificare ogni volta che qualcuno respira.",
    "> Nadir ha scelto il gruppo più tranquillo: nessuno condivide la sua coperta.",
    "> Fuori dal telefono la community ha un rumore diverso: voci, motori, risate.",
    "> La bacheca è uno strumento; le persone non sono contenuti da trattenere.",
  ],
  "chat e notifiche": [
    "> Una notifica puntuale è cortesia; la quinta è un test di pazienza.",
    "> Rei: «Il messaggio è arrivato. Ora lasciamo a chi legge il tempo di rispondere.»",
    "> Nadir sente ogni suono del telefono; non tutti annunciano l’ora di cena.",
    "> Una chat utile fa trovare il filo, non un altro gomitolo.",
    "> Mendo: «È stato consegnato?» L’Agente: «E adesso aspettiamo.»",
    "> Quebracho ignora il ping; il guinzaglio è un canale più convincente.",
    "> La notifica più chiara è quella che non costringe a indovinare la destinazione.",
    "> Nadir ha silenziato la demo. Nessuno gli aveva dato il permesso, ma ha fatto bene.",
  ],
  "sos e assistenza": [
    "> Se serve aiuto, nessuno dovrebbe dover decifrare un menu sotto pressione.",
    "> Quebracho è pronto alla passeggiata; il pulsante SOS deve essere pronto prima.",
    "> Rei: «Il flusso è chiaro solo se lo troviamo senza una guida accanto.»",
    "> Mendo prova il percorso con calma, perché il caso urgente non concede calma.",
    "> Nadir ha sentito la parola «emergenza» e ha lasciato libera la sedia.",
  ],
  "lingue e traduzioni": [
    "> Una stringa tradotta bene non fa inciampare chi la legge al primo colpo.",
    "> Mendo controlla il cambio lingua; Rei verifica che cambi anche il significato.",
  ],
  "email e comunicazioni": [
    "> L’email parte dal server; la fiducia del destinatario non si può mettere in coda.",
  ],
  "musica e ascolto": [
    "> Nadir approva la musica solo se il volume non copre il rumore della ciotola.",
  ],
};

function parseDiaryArray(source) {
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error("Diary array declaration not found");
  const jsonStart = start + prefix.length;
  const lineEnd = source.indexOf("\n", jsonStart);
  if (lineEnd < 0) throw new Error("Diary array declaration is not line-terminated");
  const line = source.slice(jsonStart, lineEnd).trimEnd();
  if (!line.endsWith("]);") ) throw new Error("Diary array JSON terminator not found");
  return { diary: JSON.parse(line.slice(0, -2)), start: jsonStart, end: lineEnd };
}

function topicFor(post) {
  const excerpt = (post.excerpt ?? "").toLocaleLowerCase("it");
  const topics = Object.keys(commentsByTopic).sort((a, b) => b.length - a.length);
  const match = topics.find((topic) => excerpt.includes(topic));
  if (match) return match;
  if (excerpt.includes("matching")) return "incontri e matching";
  throw new Error(`Unable to assign an aside topic for ${post.slug}: ${post.excerpt}`);
}

function findMorale(content, slug) {
  const match = /## La morale della favola\n\n\*\*[^\n]+\*\*/.exec(content);
  if (!match) throw new Error(`Missing morale section in ${slug}`);
  const after = content.slice(match.index + match[0].length);
  const current = /^\n\n((?:> [^\n]+\n?)+)/.exec(after);
  return { match, after, current };
}

const source = fs.readFileSync(workerPath, "utf8");
const { diary, start, end } = parseDiaryArray(source);
if (diary.length !== 235) throw new Error(`Expected 235 diary entries, got ${diary.length}`);
const missingByTopic = new Map();
const preserved = new Map();
for (const post of diary) {
  const { current } = findMorale(post.content, post.slug);
  if (current) preserved.set(post.slug, current[1].trim());
  else {
    const topic = topicFor(post);
    missingByTopic.set(topic, [...(missingByTopic.get(topic) ?? []), post]);
  }
}

for (const [topic, posts] of missingByTopic) {
  const bank = commentsByTopic[topic];
  if (!bank) throw new Error(`Missing comment bank for ${topic}`);
  if (bank.length !== posts.length) throw new Error(`Comment count mismatch for ${topic}: ${bank.length} comments for ${posts.length} posts`);
}
const availableTopics = [...missingByTopic.entries()];
const indexByTopic = new Map(availableTopics.map(([topic]) => [topic, 0]));
const quotes = new Map();
for (const post of diary) {
  const existing = preserved.get(post.slug);
  if (existing) quotes.set(post.slug, existing);
  else {
    const topic = topicFor(post);
    const i = indexByTopic.get(topic);
    quotes.set(post.slug, commentsByTopic[topic][i]);
    indexByTopic.set(topic, i + 1);
  }
}

const allQuotes = [...quotes.values()];
if (allQuotes.length !== 235) throw new Error(`Expected 235 asides, got ${allQuotes.length}`);
if (new Set(allQuotes).size !== allQuotes.length) throw new Error("Duplicate aside text found");
if (allQuotes.some((quote) => quote.length > 220)) throw new Error("An aside exceeds 220 characters");

for (const post of diary) {
  const { match, after, current } = findMorale(post.content, post.slug);
  const suffix = (current ? after.slice(current[0].length) : after).replace(/^\n+/, "");
  post.content = post.content.slice(0, match.index + match[0].length) + "\n\n" + quotes.get(post.slug) + "\n\n" + suffix;
}

const finalQuoteCount = diary.reduce((count, post) => count + (post.content.match(/^> /gm)?.length ?? 0), 0);
if (finalQuoteCount !== 235) throw new Error(`Expected exactly one aside per diary entry; found ${finalQuoteCount} quote lines`);
if (diary.some((post) => post.content.includes("## Commento non richiesto dalla redazione"))) throw new Error("The repetitive editorial heading should not return");

const updatedJson = JSON.stringify(diary);
const output = `${source.slice(0, start)}${updatedJson});${source.slice(end)}`;
fs.writeFileSync(workerPath, output);
console.log(JSON.stringify({ workerPath, diaryCount: diary.length, preservedExistingAsides: preserved.size, restoredAsides: diary.length - preserved.size, uniqueAsideTexts: new Set(allQuotes).size, quoteLines: finalQuoteCount, repeatedHeadingCount: 0 }));
