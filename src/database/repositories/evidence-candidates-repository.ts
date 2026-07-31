import type { EvidenceCandidate } from "../../evidence/extract-evidence-candidates.js";

export interface EvidenceCandidatesRepository {
  replaceForCompany(
    companyKey: string,
    candidates: EvidenceCandidate[],
    processingRunId: string
  ): Promise<number>;
  listByCompany(companyKey: string): Promise<EvidenceCandidate[]>;
}

export class InMemoryEvidenceCandidatesRepository
  implements EvidenceCandidatesRepository
{
  private byCompany = new Map<string, EvidenceCandidate[]>();

  async replaceForCompany(
    companyKey: string,
    candidates: EvidenceCandidate[],
    _processingRunId: string
  ) {
    this.byCompany.set(companyKey, candidates);
    return candidates.length;
  }

  async listByCompany(companyKey: string) {
    return this.byCompany.get(companyKey) ?? [];
  }
}
