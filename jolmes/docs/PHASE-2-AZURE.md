# Phase 2 – Azure-Deployment & Microsoft-365-Integration (Skizze)

> **Status:** Nicht Teil von Phase 1. Diese Datei ist nur eine
> Vorausplanung, damit Phase 1 nicht in Sackgassen läuft.

## Zielbild

- Paperclip läuft 24/7 in **Azure Container Apps** (West Europe).
- Persistenz auf **Azure Database for PostgreSQL Flexible Server**.
- **Entra ID SSO** statt anonymer Dev-Auth.
- **Microsoft Graph API** liefert eingehende Mails an
  Paperclip-Webhooks; Klassifikator-Agent verarbeitet sie.
- Budgets, Audit-Trails und Approvals bleiben in Paperclip.

## Architektur-Skizze

```
                Microsoft 365
                ┌────────────┐
                │  Exchange  │
                │  Online    │
                └─────┬──────┘
                      │ Graph Webhook
                      ▼
   ┌──────────────────────────────────────────┐
   │  Azure Container Apps (West Europe)      │
   │  ┌───────────────┐   ┌────────────────┐  │
   │  │ paperclip-api │ → │ paperclip-ui   │  │
   │  └──────┬────────┘   └────────────────┘  │
   │         │                                 │
   │  ┌──────▼────────┐                        │
   │  │ Heartbeat-Job │  (Container App Job)   │
   │  └──────┬────────┘                        │
   └─────────┼────────────────────────────────┘
             │
             ▼
   Azure Database for PostgreSQL (Flex)
   Azure Key Vault   (ANTHROPIC_API_KEY,
                      BETTER_AUTH_SECRET)
   Azure Storage     (Storage-Provider 'azure_blob')
```

## Offene Entscheidungen vor Phase 2

| Thema | Frage | Vorschlag |
| --- | --- | --- |
| Region | Datenresidenz nur in DE? | West Europe (NL) reicht oder Germany West Central für strikt-DE |
| SKU Postgres | Burstable oder GP? | Burstable B2s für Start, Upgrade bei Bedarf |
| Auth | Nur Entra-Tenant `jolmes.de`? | Ja, kein externer User-Pool |
| Storage | local_disk persistieren oder direkt Azure Blob? | Azure Blob, dauerhaft |
| Modelle | Nur Anthropic via API? | Ja, kein Bedrock |
| Kostencap | Wer darf erhöhen? | Nur du (CEO-Rolle in Paperclip)        |

## Vorbereitende Aufgaben

- [ ] Azure-Subscription `jolmes-paperclip-prod` provisionieren
- [ ] Resource-Group `rg-paperclip-prod-weu`
- [ ] Bicep- oder Terraform-Repo (`infra/`) anlegen
- [ ] Entra-App-Registration `paperclip-api` mit Graph-Permissions
- [ ] DNS: `paperclip.jolmes.de` → Container Apps Ingress
- [ ] Backup-Strategie für Postgres (PITR 7 Tage)

## Nicht in Phase 2

- Multi-Tenant-Mandantenfähigkeit
- Custom-Domain pro Company
- Kubernetes (AKS) – Container Apps reicht
