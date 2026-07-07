# Controllo PSU via relè USB (LCUS-1) su TC

Configurato il 2026-07-07 (Task #226). La PSU esterna si accende all'avvio del
TC e si spegne al suo shutdown, tramite un relè USB LCUS-1 collegato ai
contatti **NC** (Normally Closed): a relè diseccitato la PSU è **accesa**.

## Perché NC e non NO

Il relè si resetta a "diseccitato" a ogni ri-enumerazione USB (accensione o
riavvio del TC). Con i fili su NO la PSU sarebbe spenta durante il POST e la
GPU alimentata dalla PSU non verrebbe mai enumerata dal BIOS. Con NC la PSU
prende corrente appena il relè è alimentato dall'USB (già durante il POST).
La logica dei comandi è quindi **invertita**: eccitare il relè = spegnere la
PSU.

## Hardware

- Relè: LCUS-1, 1 canale, chip seriale **CH340** (driver nativo del kernel)
- Porta sul TC: `/dev/ttyUSB0` (unico adattatore seriale USB presente)
- USB ID: `1a86:7523 QinHeng Electronics CH340 serial converter`
- Cablaggio PSU sui contatti **COM + NC** del relè
- Nota: con cavo/porta sbagliati il modulo non enumera affatto (nessun
  `/dev/ttyUSB*`, assente da `lsusb`) — verificare cavo dati e LED del modulo.

## Protocollo seriale

9600 baud, byte raw (comandi verso il relè):

| Byte                  | Relè       | Effetto PSU (cablaggio NC) |
|-----------------------|------------|----------------------------|
| `0xA0 0x01 0x00 0xA1` | diseccitato| PSU **accesa**             |
| `0xA0 0x01 0x01 0xA2` | eccitato   | PSU **spenta**             |

## File sul TC

- `/usr/local/bin/relay-psu-on.sh` — PSU ON: diseccita il relè
- `/usr/local/bin/relay-psu-off.sh` — PSU OFF: eccita il relè
- `/usr/local/bin/relay-psu-stop.sh` — usato da `ExecStop`: allo shutdown
  vero spegne la PSU; se è in corso un **reboot** (`systemctl list-jobs`
  contiene `reboot.target`) la lascia accesa, così la GPU ha corrente al POST
- `/etc/systemd/system/relay-psu.service` — unit `oneshot` con
  `RemainAfterExit=yes`: `ExecStart` = PSU on, `ExecStop` = `relay-psu-stop.sh`.
  Ordinata con `After=dev-ttyUSB0.device` + `BindsTo` e
  `ConditionPathExists=/dev/ttyUSB0`. **Non** usare `After=multi-user.target`
  insieme a `WantedBy=multi-user.target`: crea un'attesa circolare e il job
  resta in coda per sempre (bug trovato al primo boot).

## Test manuale

```bash
sudo systemctl start relay-psu.service   # PSU ON (click)
sudo systemctl stop relay-psu.service    # PSU OFF allo shutdown vero (click)
systemctl is-active relay-psu.service    # stato corrente
```

Oppure direttamente: `sudo /usr/local/bin/relay-psu-on.sh` / `...-off.sh`.

## Disattivazione di emergenza

```bash
sudo systemctl disable --now relay-psu.service
```

Per rimuovere tutto: `sudo rm /etc/systemd/system/relay-psu.service /usr/local/bin/relay-psu-{on,off,stop}.sh && sudo systemctl daemon-reload`.

## Limiti noti

- Nessun feedback di stato dal relè (solo comando, canale unico) — fuori scope.
- Se il TC si spegne in modo anomalo (crash, mancanza corrente) il relè si
  diseccita perdendo l'USB → con NC la PSU **resta/torna accesa**. Trade-off
  accettato: con NO sarebbe fail-safe allo spegnimento ma la GPU non verrebbe
  mai vista al boot.
- Se la scheda madre taglia i 5V USB a TC spento, il relè si diseccita e la
  PSU si riaccende: in tal caso valutare le opzioni "Always On USB"/ErP nel
  BIOS.
- Stato al 2026-07-07 sera: relè temporaneamente bypassato (PSU sempre accesa
  con ponticello) in attesa di un filo di sezione adatta ai morsetti.
