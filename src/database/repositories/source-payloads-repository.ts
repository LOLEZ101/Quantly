export interface SourcePayloadsRepository {
  insertIfNew(input: {
    source_type: string;
    source_identifier: string;
    company_key: string;
    cik: string | null;
    content_hash: string;
    storage_uri: string;
    original_uri: string;
    content_type: string;
    byte_size: number;
  }): Promise<{ inserted: boolean }>;
}

export class InMemorySourcePayloadsRepository implements SourcePayloadsRepository {
  private keys = new Set<string>();

  async insertIfNew(input: {
    source_type: string;
    source_identifier: string;
    content_hash: string;
  }) {
    const key = `${input.source_type}|${input.source_identifier}|${input.content_hash}`;
    if (this.keys.has(key)) return { inserted: false };
    this.keys.add(key);
    return { inserted: true };
  }
}
