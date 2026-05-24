# Verifica rigenerazione post diaristici — Task #25

Data esecuzione: 2026-05-24

## Risultato

```
[diary] ✅ Verifica OK — tutti i 73 giorni hanno un post non vuoto
```

Tutti i 73 post diaristici (12 mar – 23 mag 2026) sono stati rigenerati con
`--force` usando la nuova logica di keyword matching globale introdotta dal task #17.

## Metodo

La rigenerazione è stata eseguita a batch di 8 giorni per rispettare i limiti
di timeout della shell, usando i flag `--from`/`--to`:

| Batch | Da | A | Post |
|-------|----|---|------|
| 1 | 2026-03-12 | 2026-03-20 | 9 |
| 2 | 2026-03-21 | 2026-04-01 | 12 |
| 3 | 2026-04-01 | 2026-04-08 | 8 |
| 4 | 2026-04-09 | 2026-04-16 | 8 |
| 5 | 2026-04-17 | 2026-04-24 | 8 |
| 6 | 2026-04-25 | 2026-05-02 | 8 |
| 7 | 2026-05-03 | 2026-05-10 | 8 |
| 8 | 2026-05-11 | 2026-05-18 | 8 |
| 9 | 2026-05-19 | 2026-05-23 | 5 |

**Totale: 73 giorni, 0 fallimenti**

## Statistiche sessioni chat per i giorni con task

Ogni giorno con task ora usa fino a 8 sessioni rilevanti (keyword matching
globale su titolo task) + 5 sessioni di contesto, invece del taglio
proporzionale precedente.

Esempi di giorni ad alta densità di task rigenerati:

| Slug | Task | Sessioni rilevanti |
|------|------|--------------------|
| diary-2026-03-16 | 21 | 8 + 5 contesto |
| diary-2026-03-18 | 22 | 8 + 5 contesto |
| diary-2026-04-17 | 16 | 8 + 5 contesto |
| diary-2026-04-18 | 29 | 8 + 5 contesto |
| diary-2026-05-19 | 34 | 0 rilevanti + 5 contesto |

## Campioni post DB (estratto)

**diary-2026-03-16** (21 task): "Giornate come questa non si pianificano
davvero: inizi con un'idea precisa e finisci con quindici task sparsi su tutto
il progetto, ognuno con le sue piccole sorprese. La parte più pesante della
mattina è stata lo stress test. Ho scritto uno script Node.js standalone —
`scripts/stress-test.ts` — pensato per girare quattro ore di fila simulando
traffico realistico su BikerLink: chat utente-utente, chat con risposte
automatiche del chatbot, proposte sul mercatino moto, richieste SOS..."

**diary-2026-03-18** (22 task): "Ventidue task aperti in un colpo solo: non è
stata una giornata tranquilla, è stata una di quelle sessioni in cui hai la
sensazione di aver demolito e ricostruito mezza applicazione
contemporaneamente. Il lavoro più visibile è il redesign completo della
schermata Match. Ho buttato via la logica per status — In attesa, Accettati,
Garage — che non aveva mai convinto nessuno..."

**diary-2026-04-18** (29 task): post con le menzioni specifiche dei task
e delle sessioni chat più denso del periodo.
