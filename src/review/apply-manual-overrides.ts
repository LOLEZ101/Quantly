import type {
  ClassificationResult,
  ManualOverrideRecord,
  PeerRelationshipResult,
  ReviewItem,
} from "../domain/types.js";

/**
 * Overrides are applied inside classify/peer builders.
 * This helper documents preserved calculated outputs in metadata.
 */
export function annotateOverrideMetadata(input: {
  classifications: ClassificationResult[];
  peers: PeerRelationshipResult[];
  overrides: ManualOverrideRecord[];
  reviewItems: ReviewItem[];
}): {
  classifications: ClassificationResult[];
  peers: PeerRelationshipResult[];
  reviewItems: ReviewItem[];
  override_log: Array<{
    override_id: string;
    preserved_calculated: unknown;
    applied_value: unknown;
  }>;
} {
  const override_log = input.overrides.map((o) => ({
    override_id: o.override_id,
    preserved_calculated:
      input.classifications.find((c) => c.company_key === o.company_key)
        ?.calculated_before_override ?? null,
    applied_value: o.payload,
  }));

  return {
    classifications: input.classifications,
    peers: input.peers,
    reviewItems: input.reviewItems,
    override_log,
  };
}
