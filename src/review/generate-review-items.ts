import type { ClassificationThresholds } from "../config/load-thresholds.js";
import type {
  ClassificationResult,
  PeerRelationshipResult,
  ReviewItem,
} from "../domain/types.js";
import type { PilotData } from "../config/load-pilot-universe.js";
import { checkReciprocity } from "../peers/check-reciprocity.js";

export function generateReviewItems(input: {
  data: PilotData;
  classifications: ClassificationResult[];
  peers: PeerRelationshipResult[];
  thresholds: ClassificationThresholds;
}): ReviewItem[] {
  const items: ReviewItem[] = [];
  const asOf = input.data.universe.as_of;
  const classMap = new Map(
    input.classifications.map((c) => [c.company_key, c])
  );

  for (const cls of input.classifications) {
    if (!cls.primary) {
      items.push(item({
        id: `rev_${cls.company_key}_no_primary`,
        company_key: cls.company_key,
        severity: "high",
        reason_code: "no_primary_path",
        description: `${cls.company_key} has no confident primary taxonomy path.`,
        suggested_action: "Manually assign a primary node or enrich segment mappings.",
        asOf,
        evidence_ids: input.data.evidence
          .filter((e) => e.company_key === cls.company_key)
          .map((e) => e.evidence_id),
      }));
    } else if (
      cls.primary.primary_selection_reason.includes("ambiguous") ||
      cls.primary.confidence_components.ambiguity_penalty > 0
    ) {
      items.push(item({
        id: `rev_${cls.company_key}_ambiguous`,
        company_key: cls.company_key,
        severity: "moderate",
        reason_code: "ambiguous_primary",
        description: `${cls.company_key} has ambiguous primary-path candidates.`,
        suggested_action: "Review segment economics and confirm primary node.",
        asOf,
        evidence_ids: cls.primary.evidence_ids,
      }));
    }

    if (
      cls.coverage_ratio <
      input.thresholds.segment_coverage.usable_with_warning_min
    ) {
      const severity =
        cls.coverage_ratio <
        input.thresholds.segment_coverage.moderate_review_min
          ? "high"
          : "moderate";
      items.push(item({
        id: `rev_${cls.company_key}_coverage`,
        company_key: cls.company_key,
        severity,
        reason_code: "low_segment_coverage",
        description: `${cls.company_key} segment coverage is ${cls.coverage_ratio} (unallocated ${cls.unallocated_weight}).`,
        suggested_action: "Improve segment disclosure mapping or accept with documented remainder.",
        asOf,
        evidence_ids: [],
      }));
    }

    if (cls.secondary.length >= 3) {
      items.push(item({
        id: `rev_${cls.company_key}_diversified`,
        company_key: cls.company_key,
        severity: "low",
        reason_code: "unusually_diversified",
        description: `${cls.company_key} has ${cls.secondary.length} secondary exposures.`,
        suggested_action: "Confirm conglomerate primary-path cascade remains appropriate.",
        asOf,
        evidence_ids: [],
      }));
    }

    const companyEvidence = input.data.evidence.filter(
      (e) => e.company_key === cls.company_key
    );
    if (companyEvidence.length === 0 && cls.primary && !cls.primary.is_manual) {
      items.push(item({
        id: `rev_${cls.company_key}_no_evidence`,
        company_key: cls.company_key,
        severity: "high",
        reason_code: "missing_evidence",
        description: `${cls.company_key} automated classification lacks evidence records.`,
        suggested_action: "Attach evidence or mark classification manual.",
        asOf,
        evidence_ids: [],
      }));
    }

    for (const peerType of ["direct_competitor", "operating"] as const) {
      const close = input.peers.filter(
        (p) =>
          p.target_company_id === cls.company_key &&
          p.peer_type === peerType &&
          p.score >= input.thresholds.peer_scoring.close_peer_min_score
      );
      if (close.length === 0) {
        items.push(item({
          id: `rev_${cls.company_key}_no_close_${peerType}`,
          company_key: cls.company_key,
          severity: "moderate",
          reason_code: "no_close_peer",
          description: `${cls.company_key} has no close ${peerType} peers in the pilot universe.`,
          suggested_action: "Expand universe, loosen threshold, or accept as sparse peer set.",
          asOf,
          evidence_ids: [],
        }));
      }
    }
  }

  for (const rel of input.peers) {
    if (rel.incomplete) {
      items.push(item({
        id: `rev_${rel.target_company_id}_${rel.peer_company_id}_${rel.peer_type}_incomplete`,
        company_key: rel.target_company_id,
        company_pair: [rel.target_company_id, rel.peer_company_id],
        severity: "low",
        reason_code: "incomplete_peer_score",
        description: `Peer score ${rel.target_company_id}→${rel.peer_company_id} (${rel.peer_type}) depends on missing components.`,
        suggested_action: "Fill missing fixture features or accept incomplete score.",
        asOf,
        evidence_ids: [],
      }));
    }
    if (
      rel.eligibility === "eligible_with_penalty" &&
      rel.peer_type === "direct_competitor" &&
      rel.eligibility_rule_id?.includes("excl")
    ) {
      items.push(item({
        id: `rev_elig_${rel.target_company_id}_${rel.peer_company_id}`,
        company_pair: [rel.target_company_id, rel.peer_company_id],
        severity: "high",
        reason_code: "eligibility_conflict",
        description: `Direct-competitor pair crossed an eligibility boundary (${rel.eligibility_rule_id}).`,
        suggested_action: "Verify exclusion rules and competitor links.",
        asOf,
        evidence_ids: [],
      }));
    }
  }

  // Reciprocity inconsistencies for top direct competitors
  for (const cls of input.classifications) {
    const top = input.peers
      .filter(
        (p) =>
          p.target_company_id === cls.company_key &&
          p.peer_type === "direct_competitor"
      )
      .slice(0, 3);
    for (const rel of top) {
      const recip = checkReciprocity({
        companyA: rel.target_company_id,
        companyB: rel.peer_company_id,
        peerType: "direct_competitor",
        relationships: input.peers,
        similarEpsilon:
          input.thresholds.peer_scoring.reciprocity_similar_score_epsilon,
      });
      if (recip.score_relationship === "materially_different_scores") {
        items.push(item({
          id: `rev_recip_${rel.target_company_id}_${rel.peer_company_id}`,
          company_pair: [rel.target_company_id, rel.peer_company_id],
          severity: "low",
          reason_code: "reciprocity_inconsistent",
          description: `Direct-competitor scores differ materially between ${rel.target_company_id} and ${rel.peer_company_id}.`,
          suggested_action: "Inspect asymmetric diversification/size effects; usually acceptable.",
          asOf,
          evidence_ids: [],
        }));
      }
    }
  }

  // Override conflicts: force primary that disagrees with calculated
  for (const ovr of input.data.overrides) {
    if (ovr.action === "force_primary_classification") {
      const cls = classMap.get(ovr.company_key);
      if (
        cls?.calculated_before_override &&
        cls.primary &&
        cls.calculated_before_override.node_id !== cls.primary.node_id
      ) {
        items.push(item({
          id: `rev_ovr_${ovr.override_id}`,
          company_key: ovr.company_key,
          severity: "moderate",
          reason_code: "override_conflicts_with_calculated",
          description: `Override ${ovr.override_id} changed primary from calculated result.`,
          suggested_action: "Confirm override rationale remains valid.",
          asOf,
          evidence_ids: [],
        }));
      }
    }
    if (ovr.action === "resolve_review_item" && typeof ovr.payload.review_item_id === "string") {
      const idx = items.findIndex((i) => i.review_item_id === ovr.payload.review_item_id);
      if (idx >= 0) items[idx] = { ...items[idx], status: "approved" };
    }
  }

  // Deduplicate by id
  const byId = new Map(items.map((i) => [i.review_item_id, i]));
  return [...byId.values()].sort((a, b) =>
    a.review_item_id.localeCompare(b.review_item_id)
  );
}

function item( partial: {
  id: string;
  company_key?: string;
  company_pair?: [string, string];
  severity: ReviewItem["severity"];
  reason_code: string;
  description: string;
  suggested_action: string;
  asOf: string;
  evidence_ids: string[];
}): ReviewItem {
  return {
    review_item_id: partial.id,
    company_key: partial.company_key,
    company_pair: partial.company_pair,
    severity: partial.severity,
    reason_code: partial.reason_code,
    description: partial.description,
    evidence_ids: partial.evidence_ids,
    suggested_action: partial.suggested_action,
    created_date: partial.asOf,
    status: "pending",
  };
}
