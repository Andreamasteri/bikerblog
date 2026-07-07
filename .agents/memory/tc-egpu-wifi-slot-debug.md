---
name: TC eGPU (GTX 1070) via slot M.2 WiFi — debug enumerazione
description: Stato e lezioni del tentativo di collegare la GTX 1070 al M910q Tiny tramite adattatore M.2 A+E (slot WiFi) + riser; la scheda non traina il link. Include relè PSU su NC e lettura/scrittura BIOS via think-lmi.
---

## Stato (2026-07-07)

La GTX 1070 NON è mai stata in questo TC prima: arriva da un altro PC, con un
adattatore M.2 A+E → PCIe (slot WiFi del M910q) arrivato oggi. La scheda non
viene enumerata: la porta root del suo slot non compare nemmeno in lspci
(l'unica porta attiva, 00:1b.0, è l'NVMe). Diagnosi rimasta: adattatore/cavo
difettoso o jumper di delay errato — da provare su un altro PC.

**Attenzione:** una vecchia nota di memoria (bowie-real-model-quality-check)
dice che la 1070 era "aggiunta al TC il 2026-07-04" — è imprecisa: la GPU era
su un altro PC. Su TC Ollama gira ancora su CPU (size_vram 0).

## Lezioni

- **PSU esterna via relè LCUS-1: cablare su NC, non NO.** Il relè si resetta
  a diseccitato a ogni enumerazione USB → con NO la PSU è spenta durante il
  POST e la GPU non può essere enumerata. Dettagli operativi in
  `docs/tc-relay-psu.md`.
- **Unit systemd: mai `After=multi-user.target` + `WantedBy=multi-user.target`**
  nella stessa unit — job in coda per sempre, unit `inactive` con `Job: N`.
- **BIOS del M910q leggibile/scrivibile da Linux via think-lmi**:
  `/sys/class/firmware-attributes/thinklmi/attributes/<Nome>/current_value`
  (lettura valori solo con sudo; scrittura diretta con `echo | sudo tee`,
  `pending_reboot` segnala il riavvio necessario). "Select Active Video" era
  su IGD, ora su Auto. Non esiste alcuna voce per abilitare lo slot M.2 WiFi.
- **Porta PCIe con link attivo ≠ GPU**: su M910q l'unico link x4 attivo è
  l'SSD NVMe dietro 00:1b.0 — non scambiarlo per la GPU.
- I riavvii `systemctl reboot` sono riavvii a caldo: se la GPU non appare
  neanche così con PSU sempre accesa, il problema non è il timing di
  alimentazione ma il link fisico (adattatore/cavo/slot).
