# Patches gegen den Upstream-Paperclip-Code

Diese Patches werden von `jolmes/bootstrap.sh` nach dem Klonen / vor dem
ersten Build idempotent auf den Repo-Root angewendet. Sie sind als
Notlösung zu verstehen, bis der jeweilige Fix Upstream gelandet ist.

## Wie ein Patch hier aussieht

- Datei-Endung `.patch`, kompatibel zu `git apply --check` und `patch -p1`.
- Eine eindeutige Marker-Zeile im Header (`# Issue: …`), die wir nutzen,
  um zu prüfen, ob der Patch schon drin ist.
- Klein bleiben: ein Patch = eine Sache. Macht Konflikte beim
  `git pull --rebase` upstream beherrschbar.

## Wie wird angewendet

Aus `bootstrap.sh`:

```bash
./jolmes/scripts/apply-patches.sh
```

Idempotenz funktioniert so:

1. Skript prüft per `grep` auf die Marker-Zeile (z. B. ein After-Pattern),
   das nur in der gepatchten Version vorkommt.
2. Wenn schon drin → skip.
3. Sonst → `git apply --check` und dann `git apply`.

## Aktive Patches

| Datei | Zweck | Upstream-Status |
| ----- | ----- | --------------- |
| `01-dev-runner-respect-ui-dev-middleware-env.patch` | `scripts/dev-runner.ts` respektiert `PAPERCLIP_UI_DEV_MIDDLEWARE`-Env, statt es immer auf `"true"` zu forcieren. Voraussetzung für Production-UI-Build auf Hetzner. | offen — PR ausstehend |

## Wenn ein Patch upstream landet

1. Eintrag in `bootstrap.sh` entfernen ist nicht nötig — Skript skippt,
   sobald das Marker-Pattern schon drin ist.
2. Patch-Datei trotzdem entfernen, damit die Liste klein bleibt. Eintrag
   in dieser Tabelle ebenfalls löschen.
