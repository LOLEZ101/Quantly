import type { ClassificationThresholds } from "../config/load-thresholds.js";
import type {
  ConfidenceComponents,
  EvidenceRecord,
  SegmentCoverageMeta,
} from "../domain/types.js";

export function calculateClassificationConfidence(input: {
  coverage: SegmentCoverageMeta | undefined;
  evidence: EvidenceRecord[];
  thresholds: ClassificationThresholds;
  ambiguity: boolean;
  isManual: boolean;
  asOf: string;
}): ConfidenceComponents {
  const w = input.thresholds.confidence.weights;
  const coverageRatio = input.coverage?.coverage_ratio ?? 0;
  const segment_coverage = Math.min(1, coverageRatio);

  const evidence_completeness =
    input.evidence.length === 0 ? 0 : Math.min(1, input.evidence.length / 2);

  const qualities = new Set(input.evidence.map((e) => e.quality));
  const source_agreement =
    input.evidence.length === 0 ? 0.3 : qualities.size === 1 ? 0.9 : 0.7;

  const staleDays = input.thresholds.confidence.stale_evidence_days;
  const asOfMs = Date.parse(input.asOf);
  let recency = 0.5;
  if (input.evidence.length > 0) {
    const ages = input.evidence.map((e) =>
      Math.max(0, (asOfMs - Date.parse(e.as_of)) / (86400000))
    );
    const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
    recency = avgAge > staleDays ? 0.35 : 0.9;
  }

  const manual_review_bonus = input.isManual ? 1 : 0;
  const ambiguity_penalty = input.ambiguity ? 1 : 0;

  const final = clamp01(
    w.segment_coverage * segment_coverage +
      w.evidence_completeness * evidence_completeness +
      w.source_agreement * source_agreement +
      w.recency * recency +
      w.manual_review_bonus * manual_review_bonus -
      w.ambiguity_penalty * ambiguity_penalty
  );

  return {
    segment_coverage,
    evidence_completeness,
    source_agreement,
    recency,
    manual_review_bonus,
    ambiguity_penalty,
    final: Number(final.toFixed(4)),
  };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
