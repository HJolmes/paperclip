# Paperclip auf Hetzner Cloud – Setup-Leitfaden

> Ziel: Paperclip läuft 24/7 auf einer Hetzner-VM in Falkenstein (DE),
> du klickst einmal in der Hetzner-Console und führst zwei Befehle aus.
> Den Rest macht cloud-init.

**Stack:**
Ubuntu 24.04 LTS · CX23 (2 vCPU / 4 GB / 40 GB SSD, Intel) · Paperclip
nativ als systemd-Service mit `pnpm dev --bind lan` (`deploymentMode=
authenticated`, eingebettete Postgres via `embedded-postgres`, Port
54329) · Caddy als Reverse-Proxy auf Port 80 → 3100 · Claude-Code-CLI
im Subscription-Modus · UFW (22 + 80 offen).

**Kosten:** ~4,15 €/Monat (CX23 inkl. Traffic).

> Hetzner hat die Intel-Generation Mitte 2025 von CX22/CX32/… auf
> CX23/CX33/… umbenannt. Falls dein Account noch alte Typen anzeigt,
> liste sie mit `hcloud server-type list` auf und setze
> `export PAPERCLIP_VM_TYPE=<name>` vor dem Skript-Aufruf.

---

## 0. Was du *einmalig* selbst tun musst

1. **Hetzner-Account haben** – setze ich voraus.
2. **Cloud-Projekt anlegen** in der Console:
   - https://console.hetzner.cloud/projects
   - „New Project" → Name z.B. `paperclip-prod`
3. **API-Token erzeugen**:
   - Im Projekt links unten: **Security → API Tokens → „Generate API Token"**
   - Description: `paperclip-up-script`
   - Permissions: **Read & Write**
   - Token sofort kopieren – wird nur einmal gezeigt.

Mehr Klicks brauchst du nicht.

---

## 1. Provisionierung (im Codespace oder lokal)

```bash
# Token in der Session exportieren (NICHT in eine Datei schreiben)
export HCLOUD_TOKEN=...kopiertes-token...

# Optional: SSH-Key generieren, falls noch keiner existiert
ls ~/.ssh/id_ed25519.pub 2>/dev/null \
  || ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""

# Server hochziehen
./jolmes/scripts/hetzner-up.sh
```

Das Skript:

1. installiert bei Bedarf die `hcloud` CLI,
2. lädt deinen SSH-Pubkey zu Hetzner hoch (Name: `paperclip-admin`),
3. legt einen Server `paperclip-prod` (CX23, fsn1, Ubuntu 24.04) an,
4. injiziert `jolmes/hetzner/cloud-init.yaml` als user-data.

**Idempotent:** zweiter Aufruf zeigt nur die IP an, legt nichts neu an.

Am Ende bekommst du die IPv4 angezeigt. Cloud-init braucht beim ersten
Boot **4 bis 6 Minuten** für Node 20, pnpm, Caddy, Repo-Clone,
`pnpm install`, DB-Migration und systemd-Service. Status live mitlesen:

```bash
ssh paperclip@<server-ip> 'tail -f /var/log/paperclip-bootstrap.log'
```

Fertig ist es, wenn `paperclip-bootstrap: done` erscheint.

---

## 2. Claude-Login auf der VM (einmalig)

Weil die VM keinen Browser hat, läuft der Auth-Flow über
Copy-Paste. Genau einmal nötig:

```bash
ssh paperclip@<server-ip>
claude login
# → zeigt eine URL. URL im lokalen Browser öffnen, einloggen,
#   Auth-Code zurückkopieren und im Terminal einfügen.

# Token landet in /home/paperclip/.claude/. Der systemd-Service liest
# diesen Pfad über HOME=/home/paperclip – ein Neustart greift den Login auf:
sudo systemctl restart paperclip
sudo systemctl status paperclip --no-pager
```

UI testen:

```bash
curl http://<server-ip>/api/health
# erwartet: {"status":"ok","deploymentMode":"authenticated",...}
```

Im Browser: <http://server-ip/> (Port 80, **kein** `:3100` — Caddy ist
davor).

**Browser-Tipp:** wenn du beim ersten Mal eine schwarze Seite siehst,
nimm **Chrome Inkognito**. Der Vite-Dev-Modus liefert einen HMR-Client,
der bei `bindHost=0.0.0.0` schlechte WebSocket-URLs erzeugt, was den
Browser-Cache verwirrt. Inkognito = sauberer State. Wird mit dem
UI-Production-Build in Phase 2 komplett behoben.

### 2.1 Board-Claim (einmalig nach erstem Login)

Die Instanz startet im `authenticated`-Mode. Beim ersten Anmelden hast
du noch keine Company-Mitgliedschaft. Im Server-Log siehst du eine
**Board-Claim-URL**:

```bash
sudo journalctl -u paperclip --no-pager | grep -E "board-claim/" | tail -1
```

`localhost:3100` durch deine Server-IP ersetzen (und `:3100` wegen Caddy
weglassen) und in Chrome aufrufen, während du eingeloggt bist → du wirst
Instance-Admin und kannst Companies anlegen / importieren.

---

## 3. Was die VM intern macht

```
┌──────────────────────────────────────────┐
│ Hetzner CX23 · Ubuntu 24.04 · Falkenstein│
│                                          │
│  Caddy :80  ──reverse_proxy──▶  :3100    │
│                                          │
│  ┌─────────────────────────────────┐     │
│  │ systemd: paperclip.service      │     │
│  │   user=paperclip                │     │
│  │   WorkingDir=~/paperclip        │     │
│  │   SERVE_UI=true                 │     │
│  │   .env: HOST=0.0.0.0            │     │
│  │         MODE=authenticated      │     │
│  │   ExecStart: pnpm dev --bind lan│     │
│  └─────────────┬───────────────────┘     │
│                │ embeds                  │
│  ┌─────────────▼──────────────────┐      │
│  │ embedded-postgres :54329       │      │
│  │ (Paperclip startet ihn selbst) │      │
│  └────────────────────────────────┘      │
│                                          │
│  UFW: 22/tcp + 80/tcp open               │
│  unattended-upgrades aktiv               │
└──────────────────────────────────────────┘
```

- **Repo-Pfad auf der VM:** `/home/paperclip/paperclip` (Fork-Klon von
  `__REPO_URL__`).
- **`.env`** wird von `jolmes/bootstrap.sh` aus `.env.example` erzeugt,
  `BETTER_AUTH_SECRET` zufällig gesetzt, **kein** `ANTHROPIC_API_KEY`
  (Subscription-Modus).
- **DB:** Paperclip startet seinen eigenen Postgres-17 über das
  Npm-Paket `embedded-postgres`, Datenpfad
  `~/.paperclip/instances/default/`. Backups später: Cron +
  `pnpm db:backup` → Hetzner Storage Box.

---

## 4. Bedienung

| Was                        | Befehl                                              |
| -------------------------- | --------------------------------------------------- |
| Status                     | `sudo systemctl status paperclip`                   |
| Logs (live)                | `sudo journalctl -u paperclip -f`                   |
| Neustart                   | `sudo systemctl restart paperclip`                  |
| Update auf neueste master  | `cd ~/paperclip && git pull && pnpm install && pnpm db:migrate && sudo systemctl restart paperclip` |
| DB-Shell                   | `~/.paperclip/instances/default/db/bin/psql -h /tmp -p 54329 -U paperclip` |
| Claude-Login erneuern      | `claude login`                                      |
| VM löschen                 | `hcloud server delete paperclip-prod`               |

---

## 5. Sicherheits-Setup im Detail

- **SSH:** nur Pubkey, kein Root-Login, kein Passwort. Service-User
  `paperclip` hat NOPASSWD-sudo für systemd-Verwaltung.
- **Firewall:** UFW erlaubt nur 22 + 80. Paperclip selbst lauscht auf
  3100, ist aber nur über Caddy lokal erreichbar.
- **Auth-Modus:** `deploymentMode=authenticated` — jeder Request muss
  ein gültiges Login-Cookie haben. Passwort-Login via better-auth.
- **Telemetrie:** `PAPERCLIP_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`
  werden vom `bootstrap.sh` in `.env` geschrieben.
- **Auto-Updates:** `unattended-upgrades` für Security-Patches aktiv.

---

## 6. Was diese Phase noch NICHT macht

- **TLS / eigene Domain** (`paperclip.jolmes.de`) – kommt mit einem
  A-Record auf die IP; Caddyfile auf `paperclip.jolmes.de {
  reverse_proxy 127.0.0.1:3100 }` umstellen, dann holt Caddy
  automatisch ein Let's-Encrypt-Cert.
- **UI Production-Build** statt `pnpm dev` – behebt die
  Vite-HMR-Cache-Inkognito-Pflicht dauerhaft.
- **M365-SSO** (Microsoft als better-auth-Provider in
  `server/src/auth/better-auth.ts`) – braucht TLS + stabile Domain
  vorher.
- **Backups:** Cron `pnpm db:backup` + push zur Hetzner Storage Box.
- **Snapshot-/Image-Rollback-Strategie.**

---

## 7. Troubleshooting

| Problem                                | Ursache                                | Fix                                                                 |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| `hetzner-up.sh`: `HCLOUD_TOKEN` fehlt  | nicht exportiert                       | `export HCLOUD_TOKEN=...`                                            |
| `Server Type not found: cx22`          | Hetzner-Rename                         | `export PAPERCLIP_VM_TYPE=cx23` (oder neuere, `hcloud server-type list`) |
| `permission denied (publickey)` per SSH| Pubkey beim Server-Anlegen verpasst    | `hcloud server delete paperclip-prod && ./jolmes/scripts/hetzner-up.sh` |
| `paperclip-bootstrap.log` bricht ab    | meist `pnpm install` OOM auf CX23      | swap aktivieren oder auf CX33 hochziehen (`hcloud server change-type`)|
| `claude: command not found`            | cloud-init noch nicht fertig           | `tail -f /var/log/paperclip-bootstrap.log` und warten              |
| UI antwortet nicht auf `:80`           | systemd-Service down oder Caddy        | `sudo systemctl status paperclip caddy`, `journalctl -u paperclip`  |
| Schwarzer Bildschirm im Browser        | Vite-HMR-Cache (bindHost=0.0.0.0)      | Chrome **Inkognito**, oder UI Production-Build (Phase 2)             |
| `local_trusted requires bind=loopback` | env-Var wurde von dev-runner gelöscht  | `ExecStart` muss `pnpm dev --bind lan` enthalten, nicht nur `pnpm dev` |
| `could not open shared memory segment` | embedded-postgres SHM-Leiche           | `sudo rm -f /dev/shm/PostgreSQL.* && sudo systemctl restart paperclip` |
| `xdg-open ENOENT` bei `auth login`     | headless VM ohne Browser-Stub          | `sudo ln -s /bin/true /usr/local/bin/xdg-open`                       |
| Edge: "Verbindung verweigert"          | SmartScreen oder Firmen-Firewall       | Chrome statt Edge, oder Mobilfunk-Hotspot zum Testen                 |
| `pnpm ERR_UNKNOWN_BUILTIN_MODULE`      | Corepack zieht pnpm@11 außerhalb Repo  | Befehl aus `~/paperclip` ausführen (dann gilt `packageManager`-Pin) |
| `company delete` wirft 500             | Upstream-Bug, FK ohne CASCADE          | in UI archivieren statt löschen (Workaround)                         |
| Subscription-Token abgelaufen          | Pro/Max-Session ausgelaufen            | `claude login` + `sudo systemctl restart paperclip`                 |
