# Cloudflare Tunnel für Paperclip (Hetzner)

Public-HTTPS-Endpunkt für die Hetzner-VM, ohne Inbound-Port am Server zu
öffnen. Zweck: TLS-pflichtige Webhooks (Microsoft Graph für Mail/To-Do)
auf Paperclip zeigen lassen und das bisherige `http://23.88.46.202/`
abschalten.

Stand: **Phase 1**, vor M365-Webhook-Integration.

---

## Architektur in einem Satz

`cloudflared` läuft als systemd-Dienst auf der Hetzner-VM, baut eine
ausgehende QUIC-Verbindung zu Cloudflares Edge auf, und Cloudflare leitet
Requests an `https://paperclip.hjolmes.org` durch den Tunnel an
`http://localhost:3100` (Paperclip API+UI) weiter.

```
   Internet ──HTTPS──▶ Cloudflare Edge ──QUIC (outbound)──▶ cloudflared ──HTTP──▶ paperclip:3100
                       (TLS-Termination)                    (Hetzner-VM)         (lokal)
```

- **Keine offenen Inbound-Ports** am Hetzner-Server außer 22 (SSH).
- **TLS-Cert** managt Cloudflare automatisch — kein Let's-Encrypt-Renewal.
- **Origin-Traffic** Edge ↔ VM ist verschlüsselt durch den Tunnel selbst,
  auch wenn das Backend lokal nur HTTP spricht.

## Dateien

| Pfad                                    | Rolle                                              |
| --------------------------------------- | -------------------------------------------------- |
| `jolmes/scripts/setup-cloudflared.sh`   | Idempotenter Setup-Lauf auf der VM                 |
| `/etc/cloudflared/config.yml`           | Tunnel-Routing (Hostname → lokaler Port)           |
| `/etc/cloudflared/<tunnel-id>.json`     | Credentials, mode 0600, **nicht committen**        |
| `~/.cloudflared/cert.pem`               | Account-Cert aus `cloudflared tunnel login`        |

## Voraussetzungen

- Domain `hjolmes.org` liegt im Cloudflare-Account (DNS-Nameserver bei
  Cloudflare).
- SSH-Zugriff auf die Hetzner-VM als der übliche `paperclip`-User
  (nicht root).
- Paperclip läuft lokal auf Port 3100 (Standard).

## Setup

### 1. Repo auf der VM aktuell holen

```bash
cd ~/paperclip
git fetch origin master
git checkout master && git pull --ff-only
```

### 2. Setup-Skript ausführen

```bash
./jolmes/scripts/setup-cloudflared.sh
```

Beim ersten Lauf erscheint ein Cloudflare-Link der Form
`https://dash.cloudflare.com/argotunnel?...`. Diesen Link kopieren, im
Browser öffnen, mit dem Cloudflare-Konto einloggen und beim Prompt
`hjolmes.org` auswählen. Danach legt das Skript an:

- Tunnel `paperclip-hetzner`
- Config `/etc/cloudflared/config.yml`
- DNS-CNAME `paperclip.hjolmes.org → <tunnel-id>.cfargotunnel.com`
- systemd-Service `cloudflared.service` (enabled + started)

### 3. Smoke-Test

Auf der VM:

```bash
curl -fsS https://paperclip.hjolmes.org/ | head -20
```

Erwartet: HTML der Paperclip-UI oder API-JSON, **gültiges TLS-Cert**
(`curl` meckert nicht).

Vom Notebook aus zusätzlich im Browser öffnen.

### 4. Altes `http://23.88.46.202/` abschalten

Sobald der Tunnel steht, sollte Port 80/443 auf dem Hetzner-Server nicht
mehr direkt erreichbar sein. UFW prüfen und ggf. dichtmachen:

```bash
sudo ufw status
sudo ufw deny 80
sudo ufw deny 443
```

Nur Port 22 (SSH) bleibt offen. Alle Web-Zugriffe gehen ab jetzt durch
den Tunnel.

## Anpassen

Per ENV-Variable überschreibbar beim Aufruf:

```bash
TUNNEL_NAME=paperclip-test \
HOSTNAME=test.hjolmes.org \
LOCAL_URL=http://localhost:3200 \
./jolmes/scripts/setup-cloudflared.sh
```

Mehrere Hostnames auf demselben Tunnel: `/etc/cloudflared/config.yml`
manuell erweitern und `sudo systemctl restart cloudflared`.

## Sicherheit

- **Credentials** `/etc/cloudflared/<tunnel-id>.json` (mode 0600) und
  `~/.cloudflared/cert.pem` niemals committen oder kopieren.
- **Zero-Trust-Policies** (optional): im Cloudflare-Dashboard unter
  *Access* kann der Tunnel-Hostname zusätzlich mit Email-OTP oder Entra-
  ID-SSO geschützt werden. Für Webhook-Endpoints aber **nicht aktivieren**
  — Microsoft Graph kann sich nicht authentisieren.
- **clientState-Secret** für Graph-Subscriptions in Paperclip-Env, nicht
  in den Tunnel-Config.
- DSGVO: Cloudflare-Traffic terminiert in der EU (Frankfurt/Amsterdam),
  Data-Processing-Agreement liegt vor.

## Renewal / Wartung

- Tunnel-Credentials sind **dauerhaft gültig**, kein Renewal nötig.
- `cloudflared` auf der VM gelegentlich updaten:
  ```bash
  sudo apt-get update && sudo apt-get install --only-upgrade cloudflared
  sudo systemctl restart cloudflared
  ```
- Logs:
  ```bash
  sudo journalctl -u cloudflared -f
  ```

## Phase 2

Beim Move auf Azure Container Apps:

- Container-App bekommt eigenes Managed-Cert für `paperclip.hjolmes.org`,
  Tunnel wird abgebaut.
- DNS-CNAME bei Cloudflare auf die Azure-FQDN umbiegen.
- `cloudflared` von der Hetzner-VM deinstallieren, Tunnel im Cloudflare-
  Dashboard löschen.

## Troubleshooting

| Symptom                                           | Ursache                                            | Fix                                                                 |
| ------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| `error="Unauthorized"` beim Tunnel-Create         | `cert.pem` veraltet                                | `cloudflared tunnel login` erneut, dann Skript noch mal             |
| 502 Bad Gateway auf `https://paperclip.hjolmes.org` | Paperclip läuft nicht auf 3100                     | `sudo systemctl status paperclip` prüfen                            |
| DNS-Route schlägt fehl                            | Name zeigt auf anderen Tunnel oder ist manuell gesetzt | Im Cloudflare-Dashboard DNS-Tab den alten Eintrag löschen, Skript erneut |
| Tunnel läuft, aber `curl` von außen timeoutet     | systemd-Service down                               | `sudo systemctl restart cloudflared`                                |
