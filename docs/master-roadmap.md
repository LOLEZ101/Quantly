# Quantly Master Roadmap

Living plan for Peer Engine → read-only API → educational website → S&P 500 expansion.

**Last updated:** recovery after Phase 3.7 crash (see [`phase-3.7-recovery-audit.md`](phase-3.7-recovery-audit.md)).

## Mission

Quantly makes sophisticated financial statistics understandable and useful to ordinary investors.

The product should help a user answer:

- What does this company actually do?
- Where does it fit within the economy?
- Which companies directly compete with it?
- Which companies have similar operating economics?
- Which companies are appropriate valuation comparisons?
- Why were those peers selected?
- How strong is the comparison?
- Which important differences weaken the comparison?
- Where did the underlying information come from?
- How recent and reliable is the data?
- What conclusions can and cannot be drawn from the statistics?

The experience must be understandable without requiring institutional finance terminology.

## Product north star — interactive hierarchy

```text
S&P 500
→ Sector
→ Industry group
→ Industry
→ Sub-industry
→ Business model
→ Product or service
→ Customer type
→ Geography or regulatory market
→ Operating model
→ Closest peer cluster
→ Company
```

**Reuse** the Peer Engine taxonomy tree + many-to-many membership model ([`architecture.md`](architecture.md), [`config/taxonomy.yaml`](../config/taxonomy.yaml)). Do not rebuild Phases 1–3.7.

## Current engine status (honest)

| Milestone | Status |
|-----------|--------|
| Phase 1 — taxonomy, schema, contracts | Complete |
| Phase 2 — 30-company pilot, `pilot-v1` | Complete |
| Phase 3 — SEC ingestion layer, `pilot-v2-sourced` | Complete (historical; circular fixtures documented) |
| Phase 3.5 — independent corpus, `pilot-v3-verified` | Complete |
| Phase 3.6 — website-readiness, `pilot-v4-official` | Complete (`website_ready_not_official`) |
| Phase 3.7 — Postgres + live EDGAR | **`official_full_pilot_verified`** (30/30 live EDGAR + Postgres E2E) |

Canonical operational snapshot: `exports/snapshots/pilot-v5-operational` → `official_full_pilot_verified`.

## Delivery phases

### Phase 3.7 (finish)

- Postgres E2E with `--repository postgres` (fail clearly if unavailable).
- Live EDGAR acceptance set and full pilot **30/30** completed (IFRS mappings unblocked GFS).
- Status earned honestly: `official_full_pilot_verified`.

### Phase 4 — Read-only snapshot API

**Implemented:** `npm run api:readonly` — see [`phase-4-api.md`](phase-4-api.md).

Serve frozen snapshot contracts from disk (default: `pilot-v5-operational`):

- Taxonomy tree / node children
- Company classification + plain-language-ready fields
- Peer groups by type with scores, components, explanations
- Provenance / source coverage / gated peer types

Every response should carry or link to provenance and confidence. **No** LLM, embeddings, live prices, or recommendations.

### Phase 5 — Educational website (pilot)

- Hierarchy explorer for the pilot taxonomy
- Company page: what they do, where they fit, peers, why/why-not
- Source / recency / limitations panels
- Ordinary-investor language first
- Integrate carefully with existing Vite/chart work; do not discard it
- Pilot universe only (not full S&P 500 UI)

### Phase 6 — Universe expansion

- Grow classifications toward S&P 500 in controlled waves
- Keep review queue and manual overrides
- No big-bang overnight coverage

### Phase 7 — Market / valuation peers

- Unlock `valuation` and `market_behavior` only after real pricing/fundamentals exist
- Never revive illustrative valuation bands as “official”

### Phase 8 — Assistive intelligence (optional)

- LLM/extraction as **assistive** evidence helpers with human review
- Never silent taxonomy authority

## Engineering principles

1. Taxonomy is a tree; membership is many-to-many.
2. Evidence and provenance travel with every public claim.
3. Publication statuses stay honest.
4. Prefer existing [`contracts/`](../contracts/) over parallel schemas.
5. No silent memory fallback when Postgres is requested.
6. No destructive Git recovery (`reset --hard`, `clean -fd`, forced checkout).
7. Ordinary-investor language in UI; institutional terms explained, not assumed.

## Near-term sequence

```text
Recovery audit → Finish/reconfirm 3.7 honestly → Phase 4 read-only API → Phase 5 website (pilot) → expand
```

## Explicit non-goals (until the named phase)

- Full S&P 500 classification overnight
- Investment recommendations
- Unsupervised LLM classification as source of truth
- Fake market/valuation peers without market data
- Rewriting Phases 1–3.6
