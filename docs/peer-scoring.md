# Peer Scoring

## Pipeline

1. **Generate candidates** with retained reasons (same node, parent, adjacency, models, customers, geography, segments, explicit competitors).
2. **Apply eligibility** from `config/peer-eligibility.yaml` → `eligible` | `eligible_with_penalty` | `ineligible`.
3. **Score components** using `config/peer-weights.yaml` for the peer type.
4. **Reweight** among available components when configured (never fabricate missing values).
5. **Apply boosts/penalties**, clamp to `[0, 1]`, rank deterministically.
6. **Explain** from components + eligibility + candidate reasons.

## Peer types (Phase 2)

| Type | Intent |
|------|--------|
| `direct_competitor` | Same end products/customers |
| `operating` | Similar operating/infrastructure economics |
| `valuation` | Multiple-relevant comparability |
| `growth` | Growth-profile comparability |
| `risk` | Industry/infra/balance-sheet risk |
| `market_behavior` | Shared industry narrative co-movement |

Phase-1 types (`economic`, `competitive`, `custom`) remain in config/contracts for compatibility.

## Missing data

If a component is unavailable:

- Leave `raw_score = null` and `missing = true`
- Exclude it from reweighted available mass
- Reduce confidence via `availableWeightShare`
- Mark `incomplete` when available weight share is below threshold
- Surface limitations in the explanation

## Eligibility before scoring

Hard exclusions (foundry↔fabless, equipment↔devices, towers↔carriers, cross-industry pairs) remove pairs from normal ranked lists for the listed peer types. Some pairs remain eligible for `risk` / `market_behavior` with penalties.

## Reciprocity

Relationships are **directed**. Use `checkReciprocity()` to inspect mutual vs one-way membership and score similarity. Reciprocal rows are not auto-created.

## Determinism

Ranking sorts by score descending, then `peer_company_id` ascending. Snapshot timestamps used for hashing are fixed for the pilot export.
