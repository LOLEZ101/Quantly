# SEC Ingestion

## Adapter

`RegulatorySourceAdapter` isolates EDGAR access from classification/peers.

- Offline: `OfflineSecAdapter` reads `data/fixtures/sec/`
- Live: `LiveSecAdapter` calls `data.sec.gov` with throttling, retries, timeouts, and raw-cache reuse

```bash
npm run phase3:pilot -- --offline
```

## Required live identification

```text
SEC_USER_AGENT=PeerEngine/0.3 (research; you@example.com)
SEC_CONTACT_EMAIL=you@example.com
```

Normal tests never call the live SEC API.

## Filing forms

Supported metadata/forms: `10-K`, `10-Q`, `8-K`, `DEF 14A`, `20-F`, `40-F`, `6-K`.

Annual forms are preferred for business/segment evidence. Quarterly forms update facts. Proxy compensation peers are evidence candidates only — never auto-promoted to direct competitors.

## Raw cache

Immutable objects under `data/raw/sec/**` keyed by source type + identifier + SHA-256.

Git ignores raw cache contents; compact fixtures remain committed under `data/fixtures/sec/`.
