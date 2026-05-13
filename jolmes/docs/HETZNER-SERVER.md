# Hetzner-Server `paperclip-prod` – Dokumentation

> Was *läuft* auf der VM, nicht *wie sie aufgesetzt wird* (dafür:
> [`HETZNER-SETUP.md`](./HETZNER-SETUP.md)). Quellen: `jolmes/hetzner/cloud-init.yaml`,
> `jolmes/scripts/hetzner-up.sh`, `jolmes/scripts/migrate-to-system-postgres.sh`,
> `jolmes/scripts/update-vm.sh`, `jolmes/SESSION-NOTES.md`.
>
> Stand: 2026-05-13. Live-Werte (Uptime, freier Speicher, Patch-Level)
> bitte direkt auf der VM nachsehen, siehe Abschnitt 7.

---

## 1. Cloud-Eckdaten

| Feld            | Wert                                                |
| --------------- | --------------------------------------------------- |
| Provider        | Hetzner Cloud                                       |
| Projekt         | `paperclip-prod`                                    |
| Server-Name     | `paperclip-prod`                                    |
| Location        | `fsn1` – Falkenstein, Sachsen (DE)                  |
| Labels          | `project=paperclip`, `managed-by=hetzner-up.sh`     |
| Provisionierung | `hcloud` CLI + `cloud-init` (Skript `hetzner-up.sh`)|
| API-Token       | Hetzner Cloud Console → Security → API Tokens       |

---

## 2. Hardware-Spezifikation (CX23)

Default-Typ aus `hetzner-up.sh` (`PAPERCLIP_VM_TYPE=cx23`). Hetzner
hat die Intel-Linie Mitte 2025 von `cx22/cx32/…` auf `cx23/cx33/…`
umbenannt.

| Feld           | Wert                                          |
| -------------- | --------------------------------------------- |
| Server-Typ     | **CX23** (Shared vCPU, Intel)                 |
| vCPU           | 2 (shared)                                    |
| RAM            | 4 GB                                          |
| Disk           | 40 GB NVMe SSD                                |
| Inkl. Traffic  | 20 TB / Monat                                 |
| IPv4 + IPv6    | beide, IPv4 dynamisch ermittelt im Bootstrap  |
| Kosten         | **~4,15 €/Monat** (inkl. Traffic + IPv4)      |

> Wenn `pnpm install` im Bootstrap an OOM stirbt: hochziehen auf
> CX33 (`hcloud server change-type paperclip-prod cx33 --upgrade-disk`)
> oder dauerhaft Swap aktivieren.

---

## 3. Betriebssystem & Basis-Layer

| Feld                | Wert                                                |
| ------------------- | --------------------------------------------------- |
| Image               | `ubuntu-24.04` (Ubuntu 24.04 LTS – „Noble Numbat")  |
| Hostname            | `paperclip`                                         |
| Zeitzone            | `Europe/Berlin`                                     |
| Locale              | `de_DE.UTF-8`                                       |
| Service-User        | `paperclip` (NOPASSWD-sudo, in Gruppe `sudo`)       |
| Root-Login          | deaktiviert (`disable_root: true`)                  |
| SSH-Passwort-Login  | aus (`ssh_pwauth: false`) – nur Pubkey              |
| Auto-Updates        | `unattended-upgrades` aktiv (Security-Patches)      |
| Sysctl-Tweaks       | `vm.swappiness=10`, `net.ipv4.tcp_syncookies=1`     |

**Eingespielte APT-Pakete** (über `cloud-init.packages`):
`ca-certificates`, `curl`, `git`, `gnupg`, `ufw`, `openssl`,
`build-essential`, `unattended-upgrades`, `debian-keyring`,
`debian-archive-keyring`, `apt-transport-https`.

**Zusätzlich nachinstalliert**:
- **Node.js 22 LTS** (NodeSource) – Pflicht, weil pnpm 11 auf
  Node 20 mit `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` crasht.
- **Corepack** + **pnpm 9.15.4** (gepinnt via `package.json` →
  `packageManager`).
- **Caddy** (Cloudsmith APT) als Reverse-Proxy.
- **PostgreSQL 18** (pgdg APT, `postgresql-18`) – siehe Abschnitt 5.
- **Claude Code CLI** (`@anthropic-ai/claude-code`, npm global,
  Subscription-Modus).
- `xdg-open` als Symlink auf `/bin/true`, damit `claude login`
  headless nicht crasht.

### 3.1 Zugangswege & Passwörter

| Weg                              | Auth                         | Wann nutzen                       |
| -------------------------------- | ---------------------------- | --------------------------------- |
| **SSH** (`ssh paperclip@<ip>`)   | Pubkey (Ed25519)             | Alltag, Updates, Deploys          |
| **Hetzner Web-Terminal**         | User-Passwort (siehe unten)  | Notnagel, wenn SSH nicht geht     |
| **Hetzner Rescue-System**        | von Hetzner generiert        | Letzter Rettungsanker (Disk mount)|

**`sudo` fragt nie ein Passwort** (`NOPASSWD:ALL` für User `paperclip`).
Das gleich beschriebene Passwort ist **ausschließlich** für interaktive
Logins über die Hetzner-Web-Console / lokale TTY.

**Web-Terminal-Zugang einrichten (einmalig):**

`cloud-init` legt für `paperclip` *kein* Passwort an und sperrt `root`
komplett (`disable_root: true`, `ssh_pwauth: false`). Die Hetzner-Web-
Console (Cloud Console → Server → „>_") will aber an einem TTY ein
Passwort. Deshalb einmalig via SSH setzen:

```bash
ssh paperclip@<server-ip>
sudo passwd paperclip          # zweimal das Wunschpasswort eingeben
exit
```

Anschließend funktioniert die Hetzner-Konsole mit:

```
paperclip login: paperclip
Password: <gerade gesetztes Passwort>
```

> **Passwort gehört in 1Password / Bitwarden**, nicht ins Repo und nicht
> in `.env`. Niemand außer dir braucht es — es ist eine reine Backup-
> Zugangsroute für den Fall, dass `sshd` oder die Netzwerk-Strecke kaputt
> ist.

**Wenn SSH gar nicht mehr geht** (Pubkey verloren, sshd kaputt):

1. Hetzner Cloud Console → Server → „Rescue" → **„Root-Passwort
   zurücksetzen"**. Das injiziert via qemu-guest-agent ein einmaliges
   Root-Passwort in `/etc/shadow` (überschreibt `disable_root`).
2. Im Web-Terminal als `root` einloggen, `sshd` reparieren bzw. einen
   neuen Pubkey nach `/home/paperclip/.ssh/authorized_keys` legen.
3. Anschließend Root wieder sperren: `passwd -l root`.

---

## 4. Netzwerk & Firewall

| Port    | Status   | Wozu                                                |
| ------- | -------- | --------------------------------------------------- |
| 22/tcp  | offen    | SSH (`OpenSSH`-UFW-Profil)                          |
| 80/tcp  | offen    | HTTP → Caddy → Paperclip                            |
| 443/tcp | zu       | TLS erst mit Domain (Phase 2) bzw. via Cloudflare-Tunnel |
| 3100    | nur lokal | Paperclip-Dev-Server, intern an Caddy gebunden     |
| 5432    | nur lokal | System-Postgres 18, nur `127.0.0.1`                |
| 54329   | nur lokal | **legacy** embedded-postgres-Port, nach Migration leer |

UFW-Default: `deny incoming`, `allow outgoing`.

Optional: **Cloudflare Tunnel** via `cloudflared` als systemd-Dienst
(siehe [`CLOUDFLARE-TUNNEL.md`](./CLOUDFLARE-TUNNEL.md)). Bei aktivem
Tunnel sollte Port 80 inbound dichtgemacht werden.

---

## 5. Datenbank

| Feld           | Wert                                                  |
| -------------- | ----------------------------------------------------- |
| Engine         | **PostgreSQL 18** (pgdg APT, `postgresql-18`)         |
| Bind           | `127.0.0.1:5432`                                      |
| DB-Name        | `paperclip`                                           |
| DB-User        | `paperclip`                                           |
| Passwort-Datei | `~/.paperclip/secrets/postgres.pwd` (`0600`)          |
| Connection-URL | in `.env` → `DATABASE_URL=postgresql://…@127.0.0.1:5432/paperclip` |
| Service        | `postgresql.service` (systemd, Distro-Paket)          |

**Migration-History:** Initial lief Paperclip mit `embedded-postgres`
(PG 18 beta, Port 54329, im Node-Prozess gehostet). Wegen wiederholter
DSM-/SHM-Segment-Verluste (FATAL 58P01, vgl. `SESSION-NOTES.md` §11.11)
einmalig migriert via `jolmes/scripts/migrate-to-system-postgres.sh`.
Der alte Datenpfad unter `~/.paperclip/instances/default/db/` bleibt
zunächst als Fallback liegen.

> Hinweis: `.claude/CLAUDE.md` nennt noch „PG 17". Das Migrations-Skript
> installiert tatsächlich PG 18 (`PG_MAJOR=18`). Source of truth ist das
> Skript bzw. `dpkg -l | grep postgresql` auf der VM.

---

## 6. Anwendungs-Stack

```
┌──────────────────────────────────────────────┐
│ Hetzner CX23 · Ubuntu 24.04 · fsn1           │
│                                              │
│  Caddy :80  ──reverse_proxy──▶  :3100        │
│                                              │
│  ┌─────────────────────────────────────┐     │
│  │ systemd: paperclip.service          │     │
│  │   User=paperclip                    │     │
│  │   WorkingDir=/home/paperclip/paperclip    │
│  │   ExecStartPre=paperclip-shm-cleanup│     │
│  │   ExecStart=pnpm dev --bind lan     │     │
│  │   Restart=on-failure, 5s            │     │
│  └────────────────┬────────────────────┘     │
│                   │ DATABASE_URL             │
│  ┌────────────────▼────────────────────┐     │
│  │ postgresql.service (PG18, :5432)    │     │
│  └─────────────────────────────────────┘     │
│                                              │
│  systemd-Timer: paperclip-m365-sync          │
│   (inert ohne M365-Secret)                   │
│                                              │
│  UFW: 22/tcp + 80/tcp                        │
│  unattended-upgrades aktiv                   │
└──────────────────────────────────────────────┘
```

| Komponente              | Pfad / Konfig                                         |
| ----------------------- | ----------------------------------------------------- |
| Repo-Klon               | `/home/paperclip/paperclip` (Branch `master`)         |
| `.env`                  | `/home/paperclip/paperclip/.env` (von `bootstrap.sh`) |
| Datenverzeichnis        | `/home/paperclip/.paperclip/instances/default/`       |
| Service-Unit            | `/etc/systemd/system/paperclip.service`               |
| SHM-Cleanup-Hook        | `/usr/local/sbin/paperclip-shm-cleanup`               |
| Caddyfile               | `/etc/caddy/Caddyfile`                                |
| M365-Timer + Units      | `/etc/systemd/system/paperclip-m365-sync.*`           |
| Bootstrap-Log           | `/var/log/paperclip-bootstrap.log`                    |
| Bootstrap-Marker        | `/var/lib/paperclip-bootstrap.done`                   |

**Wichtige `.env`-Werte** (vom `cloud-init` automatisch gesetzt):

- `HOST=0.0.0.0`
- `SERVE_UI=true`
- `PAPERCLIP_ALLOWED_HOSTNAMES=<öffentliche IPv4>`
- `PAPERCLIP_PUBLIC_URL=http://<IPv4>`
- `PAPERCLIP_UI_DEV_MIDDLEWARE=false` (Production-UI aus `ui/dist`)
- `BETTER_AUTH_BASE_URL=http://<IPv4>`
- `PAPERCLIP_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`
- `BETTER_AUTH_SECRET=` zufällig generiert
- **kein** `ANTHROPIC_API_KEY` – Claude läuft im Subscription-Modus
  über `claude login`

**Deployment-Modus:** `authenticated` (jede Anfrage braucht ein
gültiges better-auth-Cookie).

---

## 7. Live-Status & Befehlsbox

Auf der VM (als `paperclip`-User, sofern nicht anders genannt):

```bash
# Allgemeine VM-Infos
hostnamectl                       # OS, Kernel, Hostname, Architektur
lscpu                             # CPU-Modell, Kerne
free -h                           # RAM-Auslastung
df -h /                           # Disk frei
uptime                            # Uptime, Load

# Paperclip-Service
sudo systemctl status paperclip
sudo journalctl -u paperclip -f
sudo systemctl restart paperclip

# Datenbank
psql -h 127.0.0.1 -U paperclip -d paperclip
sudo systemctl status postgresql

# Caddy
sudo systemctl status caddy
sudo ss -ltnp | grep -E ':80|:3100|:5432'

# Firewall
sudo ufw status verbose

# Updates
sudo apt list --upgradable
cat /var/log/unattended-upgrades/unattended-upgrades.log | tail
./jolmes/scripts/update-vm.sh    # idempotenter App-Update-Lauf
```

Von außen (Codespace o. Ä.):

```bash
hcloud server describe paperclip-prod
hcloud server ip       paperclip-prod
curl http://<server-ip>/api/health
```

---

## 8. Bekannte Eigenheiten

- **Vite-Dev-HMR-Cache** beim ersten Browser-Aufruf → Chrome
  Inkognito. Wird mit echtem UI-Production-Build in Phase 2 obsolet.
- **embedded-postgres-SHM-Leichen** nach hartem Stop: Pre-Start-Hook
  `paperclip-shm-cleanup` räumt deterministisch auf. Nach Migration
  auf System-Postgres irrelevant, bleibt aber als Sicherheitsnetz drin.
- **Claude-Subscription-Token** läuft alle paar Wochen ab → `claude
  login` + `sudo systemctl restart paperclip`.
- **Phase-1-Limitierungen**: kein TLS, keine eigene Domain, kein
  M365-SSO, keine automatischen Backups zur Hetzner Storage Box.
  Siehe [`HETZNER-SETUP.md`](./HETZNER-SETUP.md) §6 und
  [`PHASE-2-AZURE.md`](./PHASE-2-AZURE.md).
