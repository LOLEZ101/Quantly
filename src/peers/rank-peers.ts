import type { PeerRelationshipResult } from "../domain/types.js";

/** Deterministic ranking: score desc, then peer_company_id asc. */
export function rankPeers(
  peers: PeerRelationshipResult[]
): PeerRelationshipResult[] {
  const sorted = [...peers].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.peer_company_id.localeCompare(b.peer_company_id);
  });
  return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
}
