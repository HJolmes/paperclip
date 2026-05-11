# HANDOVER – kurzer Übergabezettel

> Eine Seite. Schmierzettel zwischen Sessions, damit ein neues
> Claude-Code-Fenster (oder dein zukünftiges Ich um 23:47) in unter
> 60 Sekunden weiß, wo wir stehen.
>
> Für den großen Kontext bleibt `jolmes/SESSION-NOTES.md`. Diese Datei
> hier wird bei jedem Sessionwechsel **überschrieben**, nicht angehängt.

---

**Stand:** 2026-05-11
**Aktiver Branch:** `claude/paperclip-hetzner-setup-brSvc`
**Vorher dran gewesen:** `claude/fix-session-note-kQaV1`

## Was zuletzt passiert ist

1. Auf `claude/fix-session-note-kQaV1` zwei kleine Fixes für die
   M365-Triage gepusht – beide committed **und** auf origin, kein PR offen:
   - `3cd2aa1 fix(jolmes/m365): close run-issue from script, not agent bash-curl`
   - `8ab8be0 fix(jolmes/m365): update live agent prompt source (AGENTS.md)`
   → Entscheidung offen: PR auf master öffnen oder in nächste M365-Iteration einsammeln.

2. Auf neuem Branch `claude/paperclip-hetzner-setup-brSvc` das
   Hetzner-Provisioning angelegt (Henning will weg vom Codespace-Only-Setup):
   - `jolmes/scripts/hetzner-up.sh` – CX23 in fsn1 via hcloud-CLI
   - `jolmes/hetzner/cloud-init.yaml` – First-Boot (Docker, Node 20,
     pnpm, claude CLI, Postgres-Container, systemd-Service, UFW)
   - `jolmes/docs/HETZNER-SETUP.md` – Anleitung
   - `jolmes/SETUP.md` – Phase-2-Hosting verweist jetzt auf Hetzner
   - Status: committed + gepusht, kein PR.

## Wo Henning grade hängt

Er hat den Hetzner-Branch noch **nicht** ausgecheckt. Befehl steht
bereit, sobald sein Working-Tree clean ist:

```bash
git --no-pager status --short && \
  ( git diff --quiet && git diff --cached --quiet \
      && git fetch origin claude/paperclip-hetzner-setup-brSvc \
      && git checkout claude/paperclip-hetzner-setup-brSvc \
    || echo "STOP: working tree dirty" )
```

## Was als Nächstes dran ist

1. Branch wechseln (s.o.).
2. Hetzner-API-Token klicken:
   https://console.hetzner.cloud → Projekt `paperclip-prod` → Security
   → API Tokens → **Read & Write**.
3. `export HCLOUD_TOKEN=…` und `./jolmes/scripts/hetzner-up.sh`.
4. Nach 4–6 Min cloud-init: einmal `ssh paperclip@<ip>`, `claude login`,
   `sudo systemctl restart paperclip`.
5. UI auf `http://<ip>:3100` testen, Smoke-Test wie in `jolmes/docs/SMOKE-TEST.md`.

## Offene Folgesachen (nicht in dieser Session)

- TLS + eigene Domain `paperclip.jolmes.de` → Caddy vor 3100, dann
  3100 in UFW schließen.
- Postgres-Backups auf Hetzner Storage Box (pg_dump-Cron + rsync).
- M365-Commits zu PR machen oder mit nächster Iteration zusammen
  einreichen.
- `SESSION-NOTES.md` muss noch um den Hetzner-Schwenk ergänzt werden
  (Phase-2-Abschnitt zeigt aktuell noch Azure als Plan).

## Referenzen

- [`jolmes/SETUP.md`](./SETUP.md) – Phase 1, Codespace-Setup
- [`jolmes/docs/HETZNER-SETUP.md`](./docs/HETZNER-SETUP.md) – Phase 2, Hetzner
- [`jolmes/docs/PHASE-2-AZURE.md`](./docs/PHASE-2-AZURE.md) – Archiv (Azure-Skizze, nicht aktiv)
- [`jolmes/SESSION-NOTES.md`](./SESSION-NOTES.md) – kumulative Langfassung
- [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) – Sprache + Leitplanken
