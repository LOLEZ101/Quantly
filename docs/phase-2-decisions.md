# Phase 2 Design Decisions

This document resolves the six open Phase-1 design questions with concrete recommendations and points to where each decision is encoded.

## Decision 1: Franchise-heavy classification

**Recommendation:** Classify restaurant operating models using **location mix as the primary variable**, with revenue, operating-income, and systemwide-sales mix retained as supporting evidence. Do not collapse those measures into a single metric.

| Label | Location franchised | Encoded as |
|-------|---------------------|------------|
| `franchise_heavy` | ≥ 70% | `qsr_franchise_heavy` / `fast_casual_franchise_heavy` / asset-light franchisor when ops immaterial |
| `company_operated_heavy` | ≤ 30% | `qsr_company_operated` / `fast_casual_company_operated` / company-heavy casual |
| `hybrid_franchise_model` | > 30% and < 70% | `qsr_hybrid_franchise` / `fast_casual_hybrid_franchise` |
| `unknown_franchise_mix` | insufficient evidence | No automatic leaf; emit review item |

**Reasoning:** Reported company revenue can understate franchised unit economics because royalties are a fraction of system sales. Location mix better reflects capital intensity and peer comparability.

**Encoding:**
- Thresholds: `config/classification-thresholds.yaml` → `franchise_mix`
- Taxonomy leaves: `qsr_hybrid_franchise`, `fast_casual_hybrid_franchise` (additive)
- Classifier: `src/classification/assign-primary-path.ts`
- Fixture fields: `operating-models.json` franchise measures with source labels

## Decision 2: Collaboration and UCaaS

**Recommendation:** Keep network-led communications under telecommunications. Treat software-led collaboration / UCaaS / CPaaS as eventually belonging under a software branch. Diversified firms may have primary in one and secondary in the other.

**Phase-2 boundary (temporary):**
- Preserve `collaboration_and_ucaas` under telecom for network-adjacent communications services.
- Add a minimal `software` stub under `information_technology` as a crosswalk target for future software-led secondaries.
- No pilot company is forced into a full software taxonomy; none of the Phase-2 tickers are pure UCaaS vendors.

**Encoding:**
- Taxonomy stub: `software` under `information_technology`
- Documentation note in taxonomy-design and this file
- Classifier does not auto-assign software primary in the pilot

## Decision 3: Conglomerate primary paths

**Recommendation:** Select primary path with this ordered cascade:

1. Largest share of consolidated revenue  
2. Largest share of operating income when revenue is inconclusive (tie within configured margin)  
3. Largest share of identifiable assets when appropriate  
4. Management’s description of the principal business  
5. Strategic identity and capital-allocation focus  
6. Human review when still ambiguous  

Secondary exposure normally requires ≥10% revenue **or** ≥10% operating income **or** clear strategic importance with evidence.

Do **not** let market perception alone override reported economics. Record `primary_selection_reason`.

**Encoding:**
- Thresholds: `config/classification-thresholds.yaml` → `primary_path`, `secondary_exposure`
- Classifier: `assign-primary-path.ts`, `assign-secondary-exposures.ts`
- Output field: `primary_selection_reason` on classification results

## Decision 4: Directed versus undirected peer relationships

**Recommendation:** Store calculated peer relationships as **directed** records:

`target_company_id`, `peer_company_id`, `peer_type`, `score`, `rank`

Do not require automatic reciprocal rows. Provide `checkReciprocity()` returning mutual / one-way / similar scores / materially different scores.

**Reasoning:** Ranked lists are asymmetric because candidate universes, size, diversification, and display limits differ.

**Encoding:**
- Schema already models directed edges (`company_id` → `peer_company_id`)
- Helper: `src/peers/check-reciprocity.ts`
- No undirected duplicate store

## Decision 5: Revenue weights and incomplete disclosures

**Recommendation:** Represent separately:

- `reported_weight` (known segment share)  
- `coverage_ratio` (sum of known weights)  
- `unallocated_weight` (1 − coverage, when incomplete)

Complete breakdown: `0.99 ≤ total_weight ≤ 1.01`.  
Incomplete: do not fabricate weights; lower confidence; queue review when missing share is material.

| Coverage | Treatment |
|----------|-----------|
| ≥ 90% | Usable with warning |
| 70%–90% | Moderate confidence; review recommended |
| < 70% | Low confidence; review required |

**Encoding:**
- Thresholds: `config/classification-thresholds.yaml` → `segment_coverage`
- Validation: `src/validation/validate-exposures.ts`
- Review: `src/review/generate-review-items.ts`

## Decision 6: Hard exclusions between adjacent categories

**Recommendation:** Adjacency may generate candidates but must not auto-qualify every peer type. Apply peer-type-specific eligibility **before** weighted scoring.

Examples encoded in `config/peer-eligibility.yaml`:

| Pair class | direct_competitor | operating | valuation | risk / market_behavior |
|------------|-------------------|-----------|-----------|------------------------|
| Foundry ↔ fabless | exclude | exclude / heavy penalty | exclude | potentially include |
| Equipment ↔ chip designer | exclude | exclude | exclude | potentially include |
| Tower ↔ network operator | exclude | exclude | generally exclude | potentially include |

Results: `eligible` | `eligible_with_penalty` | `ineligible`.

**Encoding:**
- `config/peer-eligibility.yaml`
- `src/peers/apply-eligibility-rules.ts`
