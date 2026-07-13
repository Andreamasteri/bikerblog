---
name: TC eGPU (GTX 1070) via slot M.2 WiFi — debug enumerazione
description: Storia e risoluzione del collegamento GTX 1070 al M910q Tiny tramite adattatore M.2 A+E (slot WiFi). Problema risolto: BIOS nascosto + blacklist driver.
---

## Stato (2026-07-13) — RISOLTO ✅

La GTX 1070 è operativa su TC via adattatore M.2 A+E (slot WiFi PCIe x1).
- `lspci`: `02:00.0 VGA: NVIDIA GP104 [GeForce GTX 1070] (rev a1)`
- Link: PCIe x1 @ 5GT/s (Gen2, downgraded da x16 — normale per M.2 A+E)
- Driver: nvidia-580.159.03, CUDA 13.0
- Ollama: qwen3:4b e qwen3:1.7b su **100% GPU** (~6GB VRAM in uso su 8192MB)

## Cosa ha sbloccato la GPU

### 1. Opzioni BIOS nascoste (via modGRUBShell.efi)
Il BIOS M910q non espone queste opzioni nella UI ma sono scrivibili via `setup_var`:

| Opzione | Offset | Prima | Dopo |
|---|---|---|---|
| Above 4G MMIO | `0x7B1` | `0x00` (disabled) | `0x01` (enabled) |
| Aperture Size | `0x70F` | `0x01` (256MB) | `0x0F` (2048MB) |
| Memory Remap >4GB | `0x86B` | `0x01` (enabled) | — già ok |

**Procedura**: USB FAT32 con `modGRUBShell.efi` rinominato `EFI/Boot/bootx64.efi`,
boot F12 → USB EFI → prompt `grub>` → `setup_var 0x7B1 0x01` + `setup_var 0x70F 0x0F`.

**Come trovare gli offset**: leggere la variabile NVRAM dal sistema Linux live:
`cat /sys/firmware/efi/efivars/Setup-ec87d643-eba4-4bb5-a1e5-3f3e36b20da9 > /tmp/setup_nvram.bin`
poi Python con offset + 4 (i primi 4 byte delle efivars sono attributi EFI da saltare).

### 2. Blacklist driver rimosso
`/etc/modprobe.d/blacklist-nvidia.conf` blacklistava nvidia/nouveau → rinominato `.disabled`.

### 3. Mismatch kernel/moduli
Kernel attivo era `7.0.0-22-generic`, moduli nvidia installati per `7.0.0-27-generic`.
Fix: `sudo apt install linux-modules-nvidia-580-7.0.0-22-generic`.

### 4. Moduli persistenti al boot
Scritto `/etc/modules-load.d/nvidia.conf`:
```
nvidia
nvidia_modeset
nvidia_uvm
nvidia_drm
```

## Lezioni storiche (pre-risoluzione)

- **PSU esterna via relè LCUS-1: cablare su NC, non NO.** Il relè si resetta
  a diseccitato a ogni enumerazione USB → con NO la PSU è spenta durante il
  POST e la GPU non può essere enumerata.
- **Unit systemd: mai `After=multi-user.target` + `WantedBy=multi-user.target`**
  nella stessa unit — job in coda per sempre, unit `inactive` con `Job: N`.
- **Porta PCIe con link attivo ≠ GPU**: su M910q l'unico link x4 attivo è
  l'SSD NVMe dietro 00:1b.0 — non scambiarlo per la GPU.
- Le opzioni BIOS IFR si leggono dalla variabile NVRAM Setup via efivars,
  non serve estrarre il firmware (IFRExtractor-RS non funziona su AMI compresso).
