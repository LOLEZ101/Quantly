import type { PeerRelationshipResult } from "../../domain/types.js";

export interface PeerRelationshipsRepository {
  replaceAll(
    peers: PeerRelationshipResult[],
    processingRunId: string
  ): Promise<number>;
  list(processingRunId: string): Promise<PeerRelationshipResult[]>;
}

export class InMemoryPeerRelationshipsRepository
  implements PeerRelationshipsRepository
{
  private byRun = new Map<string, PeerRelationshipResult[]>();

  async replaceAll(peers: PeerRelationshipResult[], processingRunId: string) {
    this.byRun.set(processingRunId, peers);
    return peers.length;
  }

  async list(processingRunId: string) {
    return this.byRun.get(processingRunId) ?? [];
  }
}
