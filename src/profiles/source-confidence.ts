import type { ClassificationThresholds } from "../config/load-thresholds.js";
import type { ConfidenceComponents } from "../domain/types.js";
import type { SourceBackedCompanyProfile } from "./build-source-backed-profile.js";

/**
 * Extends Phase-2 confidence with source authority signals.
 * Human review improves confidence but does not force 1.0.
 */
export function calculateSourceBackedConfidence(input: {
  profile: SourceBackedCompanyProfile;
  thresholds: ClassificationThresholds;
  ambiguity: boolean;
  coverageRatio: number;
  sectionExtractionConfidence: number;
}): ConfidenceComponents & {
  source_authority: number;
  identifier_confidence: number;
  structured_evidence_share: number;
} {
  const baseWeights = input.thresholds.confidence.weights;
  const source_authority =
    input.profile.provenance.primary_business_description?.source_status ===
    "source_backed"
      ? 0.9
      : input.profile.illustrative_fallbacks.length > 3
        ? 0.35
        : 0.6;
  const identifier_confidence = input.profile.identifier.identifier_confidence;
  const structured = input.profile.evidence.filter((e) =>
    e.evidence_type.startsWith("xbrl_")
  ).length;
  const structured_evidence_share = Math.min(
    1,
    structured / Math.max(1, input.profile.evidence.length)
  );

  const segment_coverage = Math.min(1, input.coverageRatio);
  const evidence_completeness = Math.min(
    1,
    input.profile.evidence.length / 3
  );
  const source_agreement = source_authority;
  const recency = 0.85;
  const manual_review_bonus = 0;
  const ambiguity_penalty = input.ambiguity ? 1 : 0;

  const mixed =
    baseWeights.segment_coverage * segment_coverage +
    baseWeights.evidence_completeness * evidence_completeness +
    baseWeights.source_agreement * source_agreement +
    baseWeights.recency * recency +
    baseWeights.manual_review_bonus * manual_review_bonus -
    baseWeights.ambiguity_penalty * ambiguity_penalty;

  const withSource =
    0.7 * mixed +
    0.15 * identifier_confidence +
    0.1 * input.sectionExtractionConfidence +
    0.05 * structured_evidence_share;

  return {
    segment_coverage,
    evidence_completeness,
    source_agreement,
    recency,
    manual_review_bonus,
    ambiguity_penalty,
    final: Number(Math.min(1, Math.max(0, withSource)).toFixed(4)),
    source_authority,
    identifier_confidence,
    structured_evidence_share,
  };
}
