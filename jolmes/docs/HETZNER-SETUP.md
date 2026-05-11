# Paperclip auf Hetzner Cloud – Setup-Leitfaden

> Ziel: Paperclip läuft 24/7 auf einer Hetzner-VM in Falkenstein (DE),
> du klickst einmal in der Hetzner-Console und führst zwei Befehle aus.
> Den Rest macht cloud-init.

**Stack:**
Ubuntu 24.04 LTS · CX23 (2 vCPU / 4 GB / 40 GB SSD, Intel) · Docker für
Postgres · Paperclip nativ als systemd-Service · Claude-Code-CLI im
Subscription-Modus · UFW-Firewall.

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
Boot **4 bis 6 Minuten** für Docker, Node, pnpm-install und DB-Migration.
Status live mitlesen:

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
curl http://<server-ip>:3100/api/health
# erwartet: {"status":"ok",...}
```

Im Browser: <http://server-ip:3100/>

---

## 3. Was die VM intern macht

```
┌──────────────────────────────────────────┐
│ Hetzner CX23 · Ubuntu 24.04 · Falkenstein│
│                                          │
│  ┌─────────────────────────────────┐     │
│  │ systemd: paperclip.service      │     │
│  │   user=paperclip                │     │
│  │   ExecStartPre: docker compose  │     │
│  │     -f docker/docker-compose.yml│     │
│  │     up -d db   (Postgres 17)    │     │
│  │   ExecStart:   pnpm start       │     │
│  └─────────────┬───────────────────┘     │
│                │                         │
│  ┌─────────────▼──────────┐              │
│  │ Postgres 17 (Container)│              │
│  └────────────────────────┘              │
│                                          │
│  UFW: 22/tcp + 3100/tcp open             │
│  unattended-upgrades aktiv               │
└──────────────────────────────────────────┘
```

- **Repo-Pfad auf der VM:** `/home/paperclip/paperclip` (Fork-Klon von
  `__REPO_URL__`).
- **`.env`** wird von `jolmes/bootstrap.sh` aus `.env.example` erzeugt,
  `BETTER_AUTH_SECRET` zufällig gesetzt, **kein** `ANTHROPIC_API_KEY`
  (Subscription-Modus).
- **DB:** Container `paperclip-prod-db-1` mit Volume `pgdata`, Daten
  in `/var/lib/docker/volumes/`. Backups später per Hetzner Storage Box.

---

## 4. Bedienung

| Was                        | Befehl                                              |
| -------------------------- | --------------------------------------------------- |
| Status                     | `sudo systemctl status paperclip`                   |
| Logs (live)                | `sudo journalctl -u paperclip -f`                   |
| Neustart                   | `sudo systemctl restart paperclip`                  |
| Update auf neueste master  | `cd ~/paperclip && git pull && pnpm install && pnpm db:migrate && sudo systemctl restart paperclip` |
| DB-Shell                   | `docker exec -it paperclip-prod-db-1 psql -U paperclip` |
| Claude-Login erneuern      | `claude login`                                      |
| VM löschen                 | `hcloud server delete paperclip-prod`               |

---

## 5. Sicherheits-Setup im Detail

- **SSH:** nur Pubkey, kein Root-Login, kein Passwort. Service-User
  `paperclip` hat NOPASSWD-sudo, weil er Docker und systemd bedienen
  können muss.
- **Firewall:** UFW erlaubt nur 22 + 3100. Phase 2: Caddy/Traefik vor
  Paperclip schieben, 80/443 öffnen, 3100 schließen.
- **Telemetrie:** `PAPERCLIP_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`
  werden vom `bootstrap.sh` in `.env` geschrieben.
- **Auto-Updates:** `unattended-upgrades` für Security-Patches aktiv.

---

## 6. Was diese Phase noch NICHT macht

- TLS / eigene Domain (`paperclip.jolmes.de`) – kommt erst, wenn du eine
  Subdomain auf die IP zeigen lässt, dann hänge ich Caddy davor.
- Backups (Postgres-Dump → Hetzner Storage Box).
- M365-Graph-Anbindung (Phase 3).
- Entra-ID-SSO (Phase 3).
- Snapshot-/Image-Rollback-Strategie.

Reihenfolge dafür siehe `jolmes/docs/PHASE-2-AZURE.md` – inhaltlich
deckungsgleich, nur Azure-Referenzen durch Hetzner-Äquivalente ersetzt
(Container Apps → Hetzner-VM, Key Vault → `.env` + restriktive
Datei-Perms, Azure Blob → Hetzner Storage Box).

---

## 7. Troubleshooting

| Problem                                | Ursache                                | Fix                                                                 |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| `hetzner-up.sh`: `HCLOUD_TOKEN` fehlt  | nicht exportiert                       | `export HCLOUD_TOKEN=...`                                            |
| `permission denied (publickey)` per SSH| Pubkey beim Server-Anlegen verpasst    | `hcloud server delete paperclip-prod && ./jolmes/scripts/hetzner-up.sh` |
| `paperclip-bootstrap.log` bricht ab    | meist `pnpm install` OOM auf CX23      | swap aktivieren oder auf CX33 hochziehen (`hcloud server change-type`)|
| `claude: command not found`            | cloud-init noch nicht fertig           | `tail -f /var/log/paperclip-bootstrap.log` und warten              |
| UI antwortet nicht auf `:3100`         | systemd-Service down                   | `sudo systemctl status paperclip`, dann `journalctl -u paperclip`   |
| DB-Container down                      | Docker noch nicht hochgekommen         | `docker ps`, `docker compose -f ~/paperclip/docker/docker-compose.yml up -d db` |
| Subscription-Token abgelaufen          | Pro/Max-Session ausgelaufen            | `claude login` + `sudo systemctl restart paperclip`                 |
