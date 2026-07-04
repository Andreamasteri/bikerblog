# Manuali BikerLink

Archivio locale di comodità: copia dei documenti utente/legali/tecnici del
repo GitHub `Andreamasteri/Bikerlink` (branch di default), così non serve
andarli a cercare nel repo BikerLink ogni volta.

**Provenienza**: `Andreamasteri/Bikerlink` (GitHub)
**Importato il**: 2026-07-04

Questi file sono solo per **consultazione umana**. Nadir (ricerca semantica di
Horus/Bowie) non li legge: continua a usare esclusivamente
`inbox/nadir-manual.md` (vedi `inbox/README.md`).

## Contenuto

| File | Descrizione |
|---|---|
| `manuale-utente-bikerlink.md` | Manuale utente completo dell'app (fonte di `inbox/nadir-manual.md`) |
| `server/public/bikerlink-manual.pdf` | Manuale utente in formato PDF |
| `server/public/bikerlink-eula.pdf` | Termini e condizioni d'uso (EULA) |
| `server/public/bikerlink-privacy-policy.pdf` | Informativa sulla privacy |
| `server/public/bikerlink-privacy-policy-export.pdf` | Informativa privacy, versione export |
| `tabella-comparativa-bikerlink.pdf` | Tabella comparativa delle funzionalità |
| `docs/ai-schema.pdf` | Schema tecnico del sistema AI |
| `docs/ota-schema-a4.pdf` | Schema tecnico degli aggiornamenti OTA |
| `docs/stati-privacy-bikerlink.pdf` | Schema degli stati di privacy |
| `reports/db-integrity-report-2026-06-04.pdf` | Report di integrità del DB del 2026-06-04 |

## Aggiornare l'archivio

Non c'è un fetch automatico da GitHub: quando questi documenti cambiano nel
repo BikerLink, l'utente li fornirà di nuovo e andranno riscaricati/sostituiti
a mano in questa cartella (stessi nomi file, stessa struttura di sottocartelle).

Se cambia in particolare `manuale-utente-bikerlink.md`, ricordarsi di
aggiornare anche `inbox/nadir-manual.md` (la versione usata da Nadir per la
ricerca semantica) e rilanciare un reindex — vedi `inbox/README.md` e
`deploy/horus-nadir/README.md`.
