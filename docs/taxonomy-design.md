# Taxonomy Design

## Goals

Create a maintainable hierarchical taxonomy that:

1. Starts from broad economic sectors and narrows to economically meaningful peer clusters.
2. Allows variable depth (not every branch has the same number of levels).
3. Separates the tree structure from many-to-many company membership.
4. Encodes inclusion/exclusion criteria so human reviewers and future classifiers share the same rules.
5. Supports pilot depth in telecommunications, restaurants, and semiconductors & equipment without pretending the rest of the economy is fully modeled.

## Node types

| Type | Role | Typical children |
|------|------|------------------|
| `root` | Single economy root | `sector` |
| `sector` | Broad economic sector | `industry_group` |
| `industry_group` | Related industries | `industry` |
| `industry` | Recognizable industry | `sub_industry` or `peer_cluster` |
| `sub_industry` | Meaningful operating split | `peer_cluster` or (rarely) deeper `sub_industry` |
| `peer_cluster` | Leaf-ish comparison set | none (or transitional children during migrations) |
| `stub` | Placeholder for non-pilot sectors | future nodes |

Depth is intentional and uneven. Restaurants may stop at franchise-vs-operated peer clusters; semiconductors may go one level deeper for lithography vs etch equipment.

## Required node fields

Every node in `config/taxonomy.yaml` and `taxonomy_nodes` must include:

| Field | Purpose |
|-------|---------|
| `id` | Stable snake_case identifier |
| `name` | Human display name |
| `description` | Plain-language definition |
| `node_type` | One of the types above |
| `parent_id` | Parent node id (`null` only for root) |
| `inclusion_criteria` | What belongs |
| `exclusion_criteria` | What does not belong |
| `allowed_child_node_types` | Type grammar for children |
| `effective_date` | ISO date the definition became active |
| `taxonomy_version` | Version string this definition belongs to |

Derived at load/DB time:

- `path` — dotted hierarchical path from root
- `depth` — integer depth
- `is_leaf` — whether the node currently has children

## Tree vs membership

```
Taxonomy (tree)                    Company membership (graph edges)
─────────────────                  ───────────────────────────────
root                               Company A ──primary──▶ peer_cluster_x
 └─ sector                         Company A ──secondary▶ peer_cluster_y (weight 0.25)
     └─ industry_group             Company A ──segment──▶ industry_z (revenue 0.40)
         └─ industry
             └─ peer_cluster
```

A company never “is” multiple primary paths for the same taxonomy version. Secondary and segment exposures express multi-business reality without breaking the tree.

## Pilot branches

### 1. Telecommunications (US focus)

Economic distinction emphasized:

| Split | Why it matters for peers |
|-------|--------------------------|
| Network owner vs infrastructure renter / MVNO | Capex intensity, spectrum, ROIC |
| Wireless vs fixed-line | Growth drivers, competitive set, regulation |
| Consumer vs enterprise | ARPU dynamics, churn, sales motion |
| Pure connectivity vs tower / wholesale infra | Asset-light vs asset-heavy models |

Branch sketch:

```
telecommunications
├── wireless_services
│   ├── national_wireless_network_owners   (consumer + postpaid scale)
│   ├── regional_wireless_operators
│   └── wireless_mvno_and_resellers        (rent spectrum/network)
├── fixed_connectivity
│   ├── cable_broadband_operators
│   ├── fiber_network_operators
│   └── integrated_incumbent_telcos        (legacy + broadband mix)
├── telecom_infrastructure
│   ├── tower_and_macro_site_operators
│   └── wholesale_fiber_and_backhaul
└── enterprise_communications
    ├── enterprise_network_and_connectivity
    └── collaboration_and_ucaas            (software-leaning; may be secondary for many)
```

**Primary-path guidance:** Prefer the leaf that explains the majority of enterprise value. A cable operator with wireless MVNO attach stays primary in cable broadband; wireless is secondary.

### 2. Restaurants

Economic distinction emphasized:

| Split | Why it matters |
|-------|----------------|
| QSR vs fast-casual vs full-service | Ticket, labor, real estate, margins |
| Franchise-heavy vs company-operated | Capital intensity, fee income, unit growth math |
| Franchisor / brand owner vs operator | Asset-light royalty model |

Branch sketch:

```
restaurants
├── quick_service_restaurants
│   ├── qsr_franchise_heavy
│   └── qsr_company_operated
├── fast_casual_restaurants
│   ├── fast_casual_franchise_heavy
│   └── fast_casual_company_operated
├── full_service_restaurants
│   ├── casual_dining
│   └── fine_dining_and_upscale
└── restaurant_franchisors_asset_light   (brand/IP-centric, minimal company units)
```

**Primary-path guidance:** Use format first, then operating model. A 95% franchised QSR maps to `qsr_franchise_heavy`, not the asset-light franchisor cluster, unless company-operated sales are immaterial and the business is primarily royalty/brand.

### 3. Semiconductors and semiconductor equipment

Economic distinction emphasized:

| Split | Why it matters |
|-------|----------------|
| Fabless vs IDM vs foundry | Capex, gross margin, cyclicality |
| Memory vs logic/analog | Pricing cycles, customer concentration |
| Chip producers vs equipment providers | Customer vs supplier relationship in the same value chain |
| Equipment sub-segments (litho, etch/dep, metrology, ATP) | Different oligopolies and cycles |

Branch sketch:

```
semiconductors_and_equipment
├── semiconductor_devices
│   ├── fabless_chip_design
│   │   ├── fabless_compute_and_ai_accelerators
│   │   ├── fabless_mobile_and_consumer_soc
│   │   └── fabless_connectivity_and_networking
│   ├── integrated_device_manufacturers
│   ├── semiconductor_foundries
│   ├── memory_semiconductors
│   │   ├── dram_manufacturers
│   │   └── nand_and_other_memory
│   └── analog_mixed_signal_and_power
└── semiconductor_equipment
    ├── wafer_fabrication_equipment
    │   ├── lithography_equipment
    │   ├── etch_deposition_and_clean
    │   └── process_control_and_metrology
    └── assembly_test_and_packaging_equipment
```

**Primary-path guidance:** Equipment suppliers are never primary under device leaves. Diversified IDMs with large analog and logic mixes use the IDM cluster unless a single product family dominates value.

## Non-pilot sectors

Non-pilot sectors appear as `stub` or shallow `sector` / `industry_group` nodes so the root remains a coherent economy tree. They intentionally lack peer-cluster depth. Expanding a stub requires:

1. Written inclusion/exclusion criteria
2. Allowed child-type grammar
3. Adjacent-category updates
4. Taxonomy version bump
5. Migration notes for any provisional company assignments

## Exposure and weighting rules

1. **Primary path weight** is conceptual (identity), not required to equal 1.0 of revenue.
2. **Secondary exposures** should be material (guideline: ≥10% of revenue or strategic option value) and must not duplicate the primary node.
3. **Business-segment exposures** should sum to approximately 1.0 (`0.99–1.01` tolerance) when a complete segment breakdown is claimed.
4. **Customer / geographic / revenue-model / infrastructure-model** facets are orthogonal attributes used in peer scoring, not alternate taxonomy trees.
5. **Confidence** is independent of weight: a company can have high weight and low confidence (weak filings) or vice versa.

## Evidence and overrides

- Automated node assignment → one or more `classification_evidence` rows (document span, rule id, or model rationale).
- Manual classification → `is_manual = true` on the exposure and/or a `manual_overrides` row; evidence optional but recommended.
- Overrides never delete history; they close the prior effective interval.

## Versioning policy

| Change | Version bump |
|--------|--------------|
| Add leaf under existing parent | minor |
| Rename display name only | patch |
| Move node to new parent / split / merge | major |
| Criteria text clarification without membership change | patch |
| Criteria change that reassigns companies | minor or major depending on blast radius |

Taxonomy version `1.0.0` is the pilot baseline in `config/taxonomy.yaml`.

## Peer clusters and adjacency

Peer clusters are the default unit for `economic` peers. Adjacency edges (see `config/adjacent-categories.yaml`) encode “close but not the same” relationships, for example:

- national wireless network owners ↔ cable broadband (convergence / multi-play)
- fabless compute ↔ foundries (ecosystem, not peers)
- qsr_franchise_heavy ↔ restaurant_franchisors_asset_light

Adjacency influences scoring; it does not merge nodes.

## Mapping from external systems

GICS, NAICS, and SIC codes are optional crosswalk attributes on companies or nodes. They are **inputs/evidence**, not the taxonomy itself. Peer Engine taxonomy may disagree with GICS when GICS groups economically dissimilar peers (e.g., towers with carriers, restaurants with hotels).

## Resolved Phase-1 open questions

See [phase-2-decisions.md](./phase-2-decisions.md) for franchise thresholds, UCaaS/software boundary, conglomerate cascade, directed peers, incomplete disclosure handling, and adjacency eligibility exclusions.

Temporary note: `collaboration_and_ucaas` remains under telecom for network-led services; a `software` stub under information technology is the Phase-2 crosswalk for future software-led secondaries.
