export const ACCEPTANCE_SET_KEYS = [
  "vz",
  "mcd",
  "nvda",
  "intc",
  "amt",
] as const;

export interface OfficialPublicationGateInput {
  criticalBlocks: string[];
  contractErrors: string[];
  fieldProvenanceDocumented: boolean;
  circularProvenanceDetected: boolean;
  illustrativePeerBandCount: number;
  missingIdentifierCount: number;
  highSeverityReviewCount: number;
  persistenceBackend: "memory" | "postgres";
  persistenceComplete: boolean;
  postgresE2EComplete: boolean;
  liveEdgarFullFinancialCount: number;
  companyCount: number;
  /** Live EDGAR core financials for acceptance-set keys only. */
  liveEdgarAcceptanceSetCount: number;
  acceptanceSetSize: number;
  websiteReadinessPassed: boolean;
  unsupportedPeerTypesIncluded: string[];
}

export interface OfficialPublicationGateResult {
  ok: boolean;
  publication_status:
    | "blocked"
    | "acceptance_incomplete"
    | "website_ready_not_official"
    | "official_acceptance_set_verified"
    | "official_full_pilot_verified"
    | "official";
  publishable: boolean;
  official: boolean;
  published_at: string | null;
  blocks: string[];
  warnings: string[];
}

/**
 * Phase 3.6/3.7 publication gate.
 * Official statuses require Postgres E2E + live EDGAR coverage.
 */
export function evaluateOfficialPublication(
  input: OfficialPublicationGateInput,
  fixedTs: string
): OfficialPublicationGateResult {
  const blocks: string[] = [...input.criticalBlocks, ...input.contractErrors];
  const warnings: string[] = [];

  if (!input.fieldProvenanceDocumented) {
    blocks.push("Corpus field-level provenance catalog missing");
  }
  if (input.circularProvenanceDetected) {
    blocks.push("Circular Phase-2-derived fixture provenance detected");
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
    blocks.push("Pipeline persistence incomplete");
  }
  if (input.unsupportedPeerTypesIncluded.length) {
    blocks.push(
      `Unsupported peer types included: ${input.unsupportedPeerTypesIncluded.join(", ")}`
    );
  }
  if (input.highSeverityReviewCount > 0) {
    blocks.push(
      `${input.highSeverityReviewCount} high-severity review items remain open`
    );
  }

  const liveFull =
    input.liveEdgarFullFinancialCount >= input.companyCount &&
    input.companyCount > 0;
  const liveAcceptance =
    input.liveEdgarAcceptanceSetCount >= input.acceptanceSetSize &&
    input.acceptanceSetSize > 0;

  if (!liveFull) {
    warnings.push(
      `Live EDGAR full financial coverage ${input.liveEdgarFullFinancialCount}/${input.companyCount}`
    );
  }
  if (!liveAcceptance) {
    warnings.push(
      `Live EDGAR acceptance-set coverage ${input.liveEdgarAcceptanceSetCount}/${input.acceptanceSetSize}`
    );
  }
  if (!input.postgresE2EComplete) {
    warnings.push(
      "PostgreSQL end-to-end persistence not completed in this run"
    );
  }
  if (!input.websiteReadinessPassed) {
    warnings.push("Website/API readiness checks did not all pass");
  }

  if (blocks.length) {
    return {
      ok: false,
      publication_status: "blocked",
      publishable: false,
      official: false,
      published_at: null,
      blocks,
      warnings,
    };
  }

  if (
    liveFull &&
    input.postgresE2EComplete &&
    input.websiteReadinessPassed &&
    input.persistenceBackend === "postgres"
  ) {
    return {
      ok: true,
      publication_status: "official_full_pilot_verified",
      publishable: true,
      official: true,
      published_at: fixedTs,
      blocks,
      warnings,
    };
  }

  if (
    liveAcceptance &&
    input.postgresE2EComplete &&
    input.websiteReadinessPassed &&
    input.persistenceBackend === "postgres"
  ) {
    return {
      ok: true,
      publication_status: "official_acceptance_set_verified",
      publishable: false,
      official: true,
      published_at: fixedTs,
      blocks,
      warnings,
    };
  }

  // Legacy alias path: keep "official" unused for new runs; prefer explicit statuses.
  if (input.websiteReadinessPassed && input.persistenceComplete) {
    return {
      ok: true,
      publication_status: "website_ready_not_official",
      publishable: false,
      official: false,
      published_at: null,
      blocks,
      warnings,
    };
  }

  return {
    ok: true,
    publication_status: "acceptance_incomplete",
    publishable: false,
    official: false,
    published_at: null,
    blocks,
    warnings,
  };
}
