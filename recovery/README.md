# BikerBlog — ripristino Cloudflare del 18 novembre 2026

## Pubblicazione verificata
- Host: https://bikerblog.biker-link.net
- Cloudflare Worker: `bikerblog-recovery`
- Cloudflare Worker Custom Domain: `bikerblog.biker-link.net`
- Zona DNS: `biker-link.net`
- Record DNS: AAAA `100::`, proxy Cloudflare, gestito automaticamente dal Custom Domain.
- Certificato TLS: creato da Cloudflare.
- Origine dei dati: `scripts/src/seed-blog/data.json`.
- Articoli archiviati: **18**; autori: **3**; commenti: **6**.
- Servizio pubblicato come Worker module, con sorgente in `recovery/cloudflare-bikerblog-worker.mjs`.
- Verifica Cloudflare Browser Rendering: home ricevuta correttamente il 18 novembre 2026.

## Limitazioni consapevoli
Questa è una **edizione archivio in sola lettura**, non la piena migrazione del sistema originale.
- Il database PostgreSQL di Replit non è stato esportato: i contenuti aggiunti dopo il seed potrebbero mancare.
- Commenti e like di produzione non aggiornabili; nessuna scrittura verso il DB storico.
- Audio/podcast originali in storage privato Google Cloud Storage non ancora migrati.
- Generazione automatica editoriale, traduzioni, chat Horus/Bowie e ricerca semantica disattivati.
- La pagina `/in-memoria` con dedica originale a Mauri / grandepuffo è preservata.
- Nessun accesso a Replit richiesto per servire l'archivio.
- Nessun database D1 o bucket R2 creato senza dati autentici da importare.

## Prossima fase
1. Recuperare il dump PostgreSQL storico e controllare i record mancanti rispetto ai 18 articoli del seed.
2. Esportare MP3 di podcast e altri file da GCS, con checksum, verso un bucket Cloudflare R2 dedicato.
3. Progettare il nuovo backend Cloudflare Workers + D1 senza perdere permalink e contenuti.
4. Ripristinare solo in seguito scheduler, AI-Hub e funzioni interattive con controlli di sicurezza.
5. Eseguire smoke test di home, permalink, `/posts`, `/in-memoria`, `/healthz`, DNS e TLS.

## Politica Git
Branch isolato: `recovery/cloudflare-bikerblog-20261118`. Il codice storico su `main` non è stato modificato. Mantenere checkpoint frequenti senza segreti, dump o asset pesanti.
