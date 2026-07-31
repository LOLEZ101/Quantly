import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type {
  BusinessSegmentRecord,
  CompanyRecord,
  CustomerExposureRecord,
  EvidenceRecord,
  ExplicitCompetitorLink,
  FinancialFeaturesRecord,
  GeographicExposureRecord,
  ManualOverrideRecord,
  OperatingModelRecord,
  SegmentCoverageMeta,
} from "../domain/types.js";
import { repoPath } from "./paths.js";

export interface PilotUniverseConfig {
  fixture_data_version: string;
  as_of: string;
  taxonomy_version: string;
  company_keys: string[];
  industries: Record<string, string[]>;
}

export interface PilotData {
  universe: PilotUniverseConfig;
  companies: CompanyRecord[];
  segments: BusinessSegmentRecord[];
  coverage: SegmentCoverageMeta[];
  competitors: ExplicitCompetitorLink[];
  customers: CustomerExposureRecord[];
  geos: GeographicExposureRecord[];
  operating: OperatingModelRecord[];
  evidence: EvidenceRecord[];
  financial: FinancialFeaturesRecord[];
  overrides: ManualOverrideRecord[];
}

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(repoPath(relative), "utf8")) as T;
}

export function loadPilotUniverse(
  path = repoPath("config/pilot-universe.yaml")
): PilotUniverseConfig {
  return parseYaml(readFileSync(path, "utf8")) as PilotUniverseConfig;
}

export function loadPilotData(): PilotData {
  const universe = loadPilotUniverse();
  const companiesFile = readJson<{ companies: CompanyRecord[] }>(
    "data/pilot/companies.json"
  );
  const segmentsFile = readJson<{ segments: BusinessSegmentRecord[] }>(
    "data/pilot/business-segments.json"
  );
  const exposuresFile = readJson<{
    segment_coverage: SegmentCoverageMeta[];
    explicit_competitors: ExplicitCompetitorLink[];
  }>("data/pilot/company-exposures.json");
  const customersFile = readJson<{ exposures: CustomerExposureRecord[] }>(
    "data/pilot/customer-exposures.json"
  );
  const geosFile = readJson<{ exposures: GeographicExposureRecord[] }>(
    "data/pilot/geographic-exposures.json"
  );
  const operatingFile = readJson<{ models: OperatingModelRecord[] }>(
    "data/pilot/operating-models.json"
  );
  const evidenceFile = readJson<{ evidence: EvidenceRecord[] }>(
    "data/pilot/evidence.json"
  );
  const financialFile = readJson<{ features: FinancialFeaturesRecord[] }>(
    "data/pilot/financial-features.json"
  );
  const overridesFile = readJson<{ overrides: ManualOverrideRecord[] }>(
    "data/pilot/manual-overrides.json"
  );

  return {
    universe,
    companies: companiesFile.companies,
    segments: segmentsFile.segments,
    coverage: exposuresFile.segment_coverage,
    competitors: exposuresFile.explicit_competitors,
    customers: customersFile.exposures,
    geos: geosFile.exposures,
    operating: operatingFile.models,
    evidence: evidenceFile.evidence,
    financial: financialFile.features,
    overrides: overridesFile.overrides,
  };
}
