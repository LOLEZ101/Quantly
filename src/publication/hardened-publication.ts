export interface PublicationGateInput {
  criticalBlocks: string[];
  contractErrors: string[];
  provenanceClass: string | null;
  circularProvenanceDetected: boolean;
  illustrativePeerBandCount: number;
  illustrativeFallbackCount: number;
  unsupportedPeerTypesIncluded: string[];
  missingIdentifierCount: number;
  highSeverityReviewCount: number;
  persistenceComplete: boolean;
  liveEdgarVerified: boolean;
}

export interface PublicationGateResult {
  ok: boolean;
  publication_status:
    | "blocked"
    | "verified_offline_independent"
    | "verified_live_edgar";
  published_at: string | null;
  blocks: string[];
  warnings: string[];
}

const REQUIRED_PROVENANCE = "independent_offline_verified_excerpt";

/**
 * Hardened publication rules for Phase 3.5 verified snapshots.
 * Never claims live-EDGAR verification for offline fixtures.
 * Blocks circular Phase-2-derived fixtures and illustrative peer bands.
 */
export function evaluateVerifiedPublication(
  input: PublicationGateInput,
  fixedTs: string
): PublicationGateResult {
  const blocks: string[] = [...input.criticalBlocks, ...input.contractErrors];
  const warnings: string[] = [];

  if (input.circularProvenanceDetected) {
    blocks.push("Circular Phase-2-derived fixture provenance detected");
  }
  if (input.provenanceClass !== REQUIRED_PROVENANCE) {
    blocks.push(
      `Expected provenance_class=${REQUIRED_PROVENANCE}, got ${input.provenanceClass}`
    );
  }
  if (input.illustrativePeerBandCount > 0) {
    blocks.push(
      `${input.illustrativePeerBandCount} illustrative peer financial bands still influence scoring`
    );
  }
  if (input.missingIdentifierCount > 0) {
    blocks.push(
      `${input.missingIdentifierCount} companies missing identifier resolution`
    );
  }
  if (!input.persistenceComplete) {
    blocks.push("Pipeline persistence unit-of-work incomplete");
  }
  if (input.unsupportedPeerTypesIncluded.length) {
    blocks.push(
      `Unsupported peer types included without market data: ${input.unsupportedPeerTypesIncluded.join(", ")}`
    );
  }
  if (input.highSeverityReviewCount > 0) {
    blocks.push(
      `${input.highSeverityReviewCount} high-severity review items remain open`
    );
  }

  // Illustrative non-peer fields (e.g. curated taxonomy node maps) are warnings,
  // not hard blocks — peer bands are the hard gate above.
  if (input.illustrativeFallbackCount > 0) {
    warnings.push(
      `${input.illustrativeFallbackCount} non-peer illustrative/curated fallbacks remain (taxonomy judgments may still be curated)`
    );
  }
  if (!input.liveEdgarVerified) {
    warnings.push(
      "Offline independent corpus only — not live EDGAR-verified official filings"
    );
  }

  const ok = blocks.length === 0;
  const publication_status = !ok
    ? "blocked"
    : input.liveEdgarVerified
      ? "verified_live_edgar"
      : "verified_offline_independent";

  return {
    ok,
    publication_status,
    published_at: ok ? fixedTs : null,
    blocks,
    warnings,
  };
}
