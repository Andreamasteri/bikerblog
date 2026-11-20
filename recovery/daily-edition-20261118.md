# BikerBlog — Edizione cronache quotidiane, 18 novembre 2026

## Destinazione operativa

- Sito: https://bikerblog.biker-link.net/
- Hosting: Cloudflare Worker `bikerblog-recovery`
- Dominio personalizzato: `bikerblog.biker-link.net`
- Test in anteprima: `bikerblog-editorial-preview`
- Asset visivi: bucket privato Cloudflare R2 `bikerblog-media` (binding `BLOG_MEDIA`)
- Oggetti consentiti dal Worker:
  - `illustrations/que-nadir-garage.webp`
  - `illustrations/nadir-keyboard.webp`

## Editoriale

- Periodo narrato: 3 marzo – 18 novembre 2026 (261 giorni).
- Giornate coperte: **235** (90,04%).
- Giornate omesse: 26.
- Articoli originali del seed: **18**, preservati.
- Commenti storici del seed: **6**, preservati.
- Quattro firme: Mendo, L'Agente, Quebracho e Nadir.
- Tutti i capitoli retrospettivi hanno morale della favola e commento ironico.
- Le scene domestiche e le battute sono ricostruzioni dichiarate.
- Le giornate senza commit selezionati sono intermezzi riflessivi: nessun evento tecnico è spacciato per verificato in quella data.
- La perdita dati d'inizio ottobre è descritta come testimonianza del fondatore; causa, giorno esatto ed estensione non sono comprovati.
- Il giorno 11 novembre è un articolo approfondito sul matching, con preferenze opt-in, chiave di idempotenza, replay e consumer inizialmente inattivo.

## File di lavoro

- `recovery/cloudflare-bikerblog-worker.mjs`: codice del sito + dati degli articoli pubblicati.
- `recovery/daily-chronicle-2026.json`: corpus editabile delle 235 voci.
- `recovery/evidence/*.json`: campioni di titoli/SHAs dei commit selezionati.

## Limiti e prossimi miglioramenti

- La copertura del 90% è *retrospettiva*, **non** significa che esistesse un articolo pubblicato realmente ogni giorno.
- Le giornate senza prove dirette sono narrativa divulgativa; serviranno ulteriori fonti per trasformarle in cronache forensi.
- Le immagini integrate sono due anteprime leggere; il materiale grafico originale ad alta risoluzione è conservato separatamente, non ancora trasferito nel bucket R2.
- Non sono stati aggiunti audio o podcast.
- Non è ancora configurata una generazione/pubblicazione automatica quotidiana per le date future.
- Il Worker pubblico usa un dominio R2 con accesso limitato alle due chiavi di immagine elencate. Il bucket non è pubblicamente esposto.

## Git e deploy

- Repository: `Andreamasteri/bikerblog`
- Branch di lavoro: `editorial/daily-chronicle-images-20261118`
- Distribuzione via API Cloudflare con `bindings: [{type:'r2_bucket',name:'BLOG_MEDIA',bucket_name:'bikerblog-media'}]`, non da main.
- Dopo un'ulteriore modifica, confermare la versione cloud pubblicata e il binding: non basta il commit salvato.
