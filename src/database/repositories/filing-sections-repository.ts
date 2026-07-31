import type { FilingSection } from "../../normalization/extract-filing-sections.js";

export interface FilingSectionsRepository {
  replaceForCompany(
    companyKey: string,
    sections: FilingSection[],
    processingRunId: string
  ): Promise<number>;
  listByCompany(companyKey: string): Promise<FilingSection[]>;
}

export class InMemoryFilingSectionsRepository implements FilingSectionsRepository {
  private byCompany = new Map<string, FilingSection[]>();

  async replaceForCompany(
    companyKey: string,
    sections: FilingSection[],
    _processingRunId: string
  ) {
    this.byCompany.set(companyKey, sections);
    return sections.length;
  }

  async listByCompany(companyKey: string) {
    return this.byCompany.get(companyKey) ?? [];
  }
}
