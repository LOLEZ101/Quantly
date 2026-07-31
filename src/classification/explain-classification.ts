import type { ClassificationResult } from "../domain/types.js";

export function explainClassification(result: ClassificationResult): {
  summary: string;
  reasons: string[];
  limitations: string[];
} {
  if (!result.primary) {
    return {
      summary: `${result.company_key} lacks a confident primary path and requires review.`,
      reasons: ["No primary taxonomy node could be selected from curated segments."],
      limitations: [
        `Segment coverage ratio is ${result.coverage_ratio}.`,
        `Unallocated weight is ${result.unallocated_weight}.`,
      ],
    };
  }

  const reasons = [
    `Primary node ${result.primary.node_id} selected via ${result.primary.primary_selection_reason}.`,
    `Confidence ${result.primary.confidence} from coverage=${result.primary.confidence_components.segment_coverage}, evidence=${result.primary.confidence_components.evidence_completeness}.`,
  ];
  for (const sec of result.secondary) {
    reasons.push(
      `Secondary exposure ${sec.node_id} (weight ${sec.weight}) due to ${sec.materiality_reason}.`
    );
  }

  const limitations: string[] = [
    "Pilot classification uses manually curated segment weights.",
  ];
  if (!result.coverage_ratio || result.coverage_ratio < 0.99) {
    limitations.push(
      `Segment coverage is incomplete (${result.coverage_ratio}); unallocated=${result.unallocated_weight}.`
    );
  }
  if (result.primary.is_manual) {
    limitations.push("Primary path reflects a manual override.");
  }

  return {
    summary: `${result.company_key} primary path is ${result.primary.path}.`,
    reasons,
    limitations,
  };
}
