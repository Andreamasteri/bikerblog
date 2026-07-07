# Controllo PSU via relè USB (LCUS-1) su TC

Configurato il 2026-07-07 (Task #226). La PSU esterna si accende all'avvio del
TC e si spegne al suo shutdown, tramite un relè USB LCUS-1 collegato ai
contatti **NO** (Normally Open): a relè non alimentato/OFF la PSU è spenta.

## Hardware

- Relè: LCUS-1, 1 canale, chip seriale **CH340** (driver nativo del kernel)
- Porta sul TC: `/dev/ttyUSB0` (unico adattatore seriale USB presente)
- USB ID: `1a86:7523 QinHeng Electronics CH340 serial converter`
- Nota: con cavo/porta sbagliati il modulo non enumera affatto (nessun
  `/dev/ttyUSB*`, assente da `lsusb`) — verificare cavo dati e LED del modulo.

## Protocollo seriale

9600 baud, byte raw:

| Azione | Byte                      |
|--------|---------------------------|
| ON     | `0xA0 0x01 0x01 0xA2`     |
| OFF    | `0xA0 0x01 0x00 0xA1`     |

## File sul TC

- `/usr/local/bin/relay-psu-on.sh` — `stty -F /dev/ttyUSB0 9600 raw -echo` +
  `printf` dei byte ON
- `/usr/local/bin/relay-psu-off.sh` — idem con i byte OFF
- `/etc/systemd/system/relay-psu.service` — unit `oneshot` con
  `RemainAfterExit=yes`: `ExecStart` = on al boot (`multi-user.target`),
  `ExecStop` = off allo shutdown. Ha `ConditionPathExists=/dev/ttyUSB0` per
  non fallire se il relè è scollegato. Abilitata con `systemctl enable`.

## Test manuale

```bash
sudo systemctl start relay-psu.service   # PSU ON (click)
sudo systemctl stop relay-psu.service    # PSU OFF (click)
systemctl is-active relay-psu.service    # stato corrente
```

Oppure direttamente: `sudo /usr/local/bin/relay-psu-on.sh` / `...-off.sh`.

## Disattivazione di emergenza

```bash
sudo systemctl disable --now relay-psu.service
```

La PSU torna controllabile solo staccando il relè o richiamando gli script a
mano. Per rimuovere tutto: `sudo rm /etc/systemd/system/relay-psu.service /usr/local/bin/relay-psu-{on,off}.sh && sudo systemctl daemon-reload`.

## Limiti noti

- Nessun feedback di stato dal relè (solo comando, canale unico) — fuori scope.
- Se il TC si spegne in modo anomalo (crash, mancanza corrente), `ExecStop`
  non viene eseguito ma il relè si diseccita comunque perdendo alimentazione
  USB → con i contatti NO la PSU si spegne lo stesso (fail-safe).
