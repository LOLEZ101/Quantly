import {
  CompaniesRepository,
  InMemoryCompaniesRepository,
} from "./repositories/companies-repository.js";
import {
  SourcePayloadsRepository,
  InMemorySourcePayloadsRepository,
} from "./repositories/source-payloads-repository.js";
import {
  FinancialFactsRepository,
  InMemoryFinancialFactsRepository,
} from "./repositories/financial-facts-repository.js";
import {
  FilingSectionsRepository,
  InMemoryFilingSectionsRepository,
} from "./repositories/filing-sections-repository.js";
import {
  EvidenceCandidatesRepository,
  InMemoryEvidenceCandidatesRepository,
} from "./repositories/evidence-candidates-repository.js";
import {
  IdentifierResolutionsRepository,
  InMemoryIdentifierResolutionsRepository,
} from "./repositories/identifier-resolutions-repository.js";
import {
  ClassificationsRepository,
  InMemoryClassificationsRepository,
} from "./repositories/classifications-repository.js";
import {
  PeerRelationshipsRepository,
  InMemoryPeerRelationshipsRepository,
} from "./repositories/peer-relationships-repository.js";
import {
  ReviewItemsRepository,
  InMemoryReviewItemsRepository,
} from "./repositories/review-items-repository.js";
import type { CachedSourceRecord } from "../sources/raw-cache.js";
import type { NormalizedFinancialFact } from "../normalization/normalize-financial-fact.js";
import type { FilingSection } from "../normalization/extract-filing-sections.js";
import type { EvidenceCandidate } from "../evidence/extract-evidence-candidates.js";
import type { ResolvedCompanyIdentifiers } from "../sources/types.js";
import type {
  ClassificationResult,
  PeerRelationshipResult,
  ReviewItem,
} from "../domain/types.js";

export interface PipelineUnitOfWork {
  companies: CompaniesRepository;
  sourcePayloads: SourcePayloadsRepository;
  financialFacts: FinancialFactsRepository;
  filingSections: FilingSectionsRepository;
  evidenceCandidates: EvidenceCandidatesRepository;
  identifierResolutions: IdentifierResolutionsRepository;
  classifications: ClassificationsRepository;
  peerRelationships: PeerRelationshipsRepository;
  reviewItems: ReviewItemsRepository;
}

export interface PersistenceSummary {
  companies_upserted: number;
  source_payloads_inserted: number;
  facts_upserted: number;
  sections_upserted: number;
  evidence_candidates_upserted: number;
  identifier_resolutions: number;
  classifications: number;
  peer_relationships: number;
  review_items: number;
  complete: boolean;
}

export function createInMemoryUnitOfWork(): PipelineUnitOfWork {
  return {
    companies: new InMemoryCompaniesRepository(),
    sourcePayloads: new InMemorySourcePayloadsRepository(),
    financialFacts: new InMemoryFinancialFactsRepository(),
    filingSections: new InMemoryFilingSectionsRepository(),
    evidenceCandidates: new InMemoryEvidenceCandidatesRepository(),
    identifierResolutions: new InMemoryIdentifierResolutionsRepository(),
    classifications: new InMemoryClassificationsRepository(),
    peerRelationships: new InMemoryPeerRelationshipsRepository(),
    reviewItems: new InMemoryReviewItemsRepository(),
  };
}

export async function persistPipelineStage(input: {
  uow: PipelineUnitOfWork;
  processingRunId: string;
  company: {
    company_key: string;
    legal_name: string;
    display_name: string;
    cik: string | null;
  };
  resolution?: ResolvedCompanyIdentifiers;
  cachedPayloads?: CachedSourceRecord[];
  facts?: Array<NormalizedFinancialFact & { is_canonical?: boolean }>;
  sections?: FilingSection[];
  evidence?: EvidenceCandidate[];
}): Promise<void> {
  await input.uow.companies.upsertByKey(input.company);
  if (input.resolution) {
    await input.uow.identifierResolutions.upsert(
      input.resolution,
      input.processingRunId
    );
  }
  for (const payload of input.cachedPayloads ?? []) {
    await input.uow.sourcePayloads.insertIfNew({
      source_type: payload.source_type,
      source_identifier: payload.source_identifier,
      company_key: payload.company_key,
      cik: payload.cik,
      content_hash: payload.content_hash,
      storage_uri: payload.storage_uri,
      original_uri: payload.original_uri,
      content_type: payload.content_type,
      byte_size: payload.byte_size,
    });
  }
  if (input.facts?.length) {
    // Persist only concept-mapped facts. Full companyfacts dumps are huge and
    // unnecessary for peer/official support (raw cache retains the source blob).
    const mapped = input.facts.filter((f) => Boolean(f.normalized_metric));
    if (mapped.length) {
      await input.uow.financialFacts.upsertMany(
        mapped,
        input.processingRunId
      );
    }
  }
  if (input.sections) {
    await input.uow.filingSections.replaceForCompany(
      input.company.company_key,
      input.sections,
      input.processingRunId
    );
  }
  if (input.evidence) {
    await input.uow.evidenceCandidates.replaceForCompany(
      input.company.company_key,
      input.evidence,
      input.processingRunId
    );
  }
}

export async function persistPipelineOutputs(input: {
  uow: PipelineUnitOfWork;
  processingRunId: string;
  classifications: ClassificationResult[];
  peers: PeerRelationshipResult[];
  reviewItems: ReviewItem[];
}): Promise<PersistenceSummary> {
  const classifications = await input.uow.classifications.replaceAll(
    input.classifications,
    input.processingRunId
  );
  const peer_relationships = await input.uow.peerRelationships.replaceAll(
    input.peers,
    input.processingRunId
  );
  const review_items = await input.uow.reviewItems.replaceAll(
    input.reviewItems,
    input.processingRunId
  );
  const identifiers = await input.uow.identifierResolutions.list(
    input.processingRunId
  );

  return {
    companies_upserted: identifiers.length,
    source_payloads_inserted: 0,
    facts_upserted: 0,
    sections_upserted: 0,
    evidence_candidates_upserted: 0,
    identifier_resolutions: identifiers.length,
    classifications,
    peer_relationships,
    review_items,
    complete:
      classifications > 0 &&
      peer_relationships > 0 &&
      identifiers.length > 0,
  };
}
