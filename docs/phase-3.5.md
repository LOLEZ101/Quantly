# Phase 3.5 — Provenance, Persistence, and Publication Hardening

## Objective

Determine which Phase-3 claims are independently supported, eliminate circular verification, complete pipeline persistence, replace illustrative peer financial bands with filing-derived metrics where possible, and publish `pilot-v3-verified`.

## What changed

1. **Provenance audit** — `docs/phase-3.5-provenance-audit.md` documents that `scripts/generate-sec-fixtures.ts` derived “SEC” fixtures from Phase-2 curated JSON (circular).
2. **Independent corpus** — `src/verified/independent-corpus.ts` + `data/verified/sec/` via `npm run fixtures:verified`. Does **not** import Phase-2 segment/operating fixtures.
3. **Deprecated circular generator** — `fixtures:sec` still regenerates historical Phase-3 fixtures but warns; not used for verified publication.
4. **Derived peer financial bands** — `src/profiles/derive-financial-features.ts` maps revenue/OI/assets/debt/capex (+ YoY revenue) into size/growth/profitability/leverage/capex bands.
5. **Gated peer types** — `valuation` and `market_behavior` excluded from default verified scoring (`src/peers/verified-peer-types.ts`).
6. **Persistence unit-of-work** — repositories for facts, sections, evidence, identifiers, classifications, peers, review items + in-memory UoW used by the verified pipeline; Postgres helpers in `pg-repositories.ts`.
7. **Hardened publication** — `src/publication/hardened-publication.ts` blocks circular provenance, illustrative peer bands, missing identifiers, incomplete persistence, and never claims live EDGAR verification for offline fixtures.
8. **Snapshot** — `exports/snapshots/pilot-v3-verified` (`snap_pilot_v3_verified`). Does not overwrite `pilot-v1` or `pilot-v2-sourced`.

## Commands

```bash
npm run fixtures:verified
npm run phase3.5:verified
npm test
npm run phase2:pilot
npm run phase3:pilot   # historical Phase-3 path (circular fixtures)
```

## Publication status meanings

| Status | Meaning |
|--------|---------|
| `verified_offline_independent` | Offline corpus independent of Phase-2 circularity; peer bands derived; market peer types gated |
| `verified_live_edgar` | Reserved for live EDGAR path (not default) |
| `blocked` | Gate failed |
| `published` (Phase-3 v2) | Historical overstatement — retained as artifact only |

## Explicit non-claims

- Not full official EDGAR archives
- Not live market/pricing data
- Segment→taxonomy node maps remain curated judgments
- Customer/geo exposures remain Phase-2 curated
