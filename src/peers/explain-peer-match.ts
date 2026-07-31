import type {
  EligibilityDecision,
} from "./apply-eligibility-rules.js";
import type {
  ClassificationResult,
  PeerExplanation,
  ScoreComponent,
} from "../domain/types.js";

export function explainPeerMatch(input: {
  targetKey: string;
  peerKey: string;
  targetName: string;
  peerName: string;
  peerType: string;
  candidateReasons: string[];
  eligibility: EligibilityDecision;
  components: ScoreComponent[];
  score: number;
  incomplete: boolean;
  classifications: Map<string, ClassificationResult>;
}): PeerExplanation {
  const present = input.components
    .filter((c) => !c.missing && c.configured_weight > 0)
    .sort((a, b) => b.weighted_contribution - a.weighted_contribution);

  const strongest = present.slice(0, 3);
  const weakest = [...present]
    .filter((c) => c.factor_score < 0.55)
    .slice(0, 3);

  const tNode = input.classifications.get(input.targetKey)?.primary?.node_id;
  const pNode = input.classifications.get(input.peerKey)?.primary?.node_id;

  const similarities = strongest.map((c) => {
    if (c.factor_code === "taxonomy_proximity") {
      return tNode === pNode
        ? `Both map primarily to ${tNode}.`
        : `Taxonomy proximity is high between ${tNode} and ${pNode}.`;
    }
    if (c.factor_code === "competitive_overlap") {
      return "Evidence or customer overlap indicates competitive interaction.";
    }
    if (c.factor_code === "business_model_similarity") {
      return "Infrastructure / operating models are similar.";
    }
    if (c.factor_code === "segment_overlap") {
      return "Business-segment composition overlaps materially.";
    }
    if (c.factor_code === "customer_overlap") {
      return "Customer-type mix is similar.";
    }
    if (c.factor_code === "growth_similarity") {
      return "Growth bands are comparable in the pilot features.";
    }
    return `${c.factor_code.replaceAll("_", " ")} contributes ${c.weighted_contribution.toFixed(2)} to the score.`;
  });

  if (similarities.length === 0) {
    similarities.push("Limited overlapping scored components were available.");
  }

  const differences = weakest.map((c) => {
    return `${c.factor_code.replaceAll("_", " ")} is relatively weak (${c.factor_score.toFixed(2)}).`;
  });
  if (tNode && pNode && tNode !== pNode) {
    differences.unshift(
      `Primary taxonomy nodes differ (${tNode} vs ${pNode}).`
    );
  }
  if (differences.length === 0) {
    differences.push("No large scored differences stood out among available components.");
  }

  const limitations = [
    "The pilot uses manually curated segment weights and illustrative financial bands.",
  ];
  const missing = input.components.filter((c) => c.missing && c.configured_weight > 0);
  if (missing.length) {
    limitations.push(
      `Missing components: ${missing.map((m) => m.factor_code).join(", ")}.`
    );
  }
  if (input.incomplete) {
    limitations.push("Score marked incomplete due to low available-weight coverage.");
  }

  const eligibility_notes =
    input.eligibility.result === "eligible"
      ? []
      : [
          `${input.eligibility.result} via ${input.eligibility.rule_id ?? "rule"}: ${input.eligibility.explanation}`,
        ];

  const why_appropriate = `${input.peerName} is retained for peer type ${input.peerType} because candidate reasons include ${input.candidateReasons.join(", ") || "taxonomy proximity"} and eligibility is ${input.eligibility.result}.`;

  const why_not_higher =
    weakest.length > 0
      ? `Score is not higher mainly due to weaker ${weakest.map((w) => w.factor_code).join(", ")}.`
      : input.eligibility.result === "eligible_with_penalty"
        ? `An eligibility penalty of ${input.eligibility.penalty} was applied.`
        : "Available components are already relatively strong; residual gap reflects imperfect overlap.";

  const summary =
    input.score >= 0.75
      ? `${input.peerName} is a close ${input.peerType.replaceAll("_", " ")} for ${input.targetName}.`
      : input.score >= 0.55
        ? `${input.peerName} is a relevant ${input.peerType.replaceAll("_", " ")} for ${input.targetName}.`
        : `${input.peerName} is a weaker ${input.peerType.replaceAll("_", " ")} for ${input.targetName}.`;

  return {
    summary,
    similarities,
    differences,
    limitations,
    candidate_reasons: input.candidateReasons,
    eligibility_notes,
    why_appropriate,
    why_not_higher,
    confidence: Number(
      Math.min(
        1,
        present.reduce((s, c) => s + c.adjusted_weight, 0)
      ).toFixed(4)
    ),
  };
}
