import type {
  PeerRelationshipResult,
  PeerType,
  ReciprocityResult,
} from "../domain/types.js";

export function checkReciprocity(input: {
  companyA: string;
  companyB: string;
  peerType: PeerType;
  relationships: PeerRelationshipResult[];
  similarEpsilon?: number;
}): ReciprocityResult {
  const eps = input.similarEpsilon ?? 0.08;
  const a_to_b =
    input.relationships.find(
      (r) =>
        r.target_company_id === input.companyA &&
        r.peer_company_id === input.companyB &&
        r.peer_type === input.peerType
    ) ?? null;
  const b_to_a =
    input.relationships.find(
      (r) =>
        r.target_company_id === input.companyB &&
        r.peer_company_id === input.companyA &&
        r.peer_type === input.peerType
    ) ?? null;

  let relationship: ReciprocityResult["relationship"] = "none";
  if (a_to_b && b_to_a) relationship = "mutual_peer";
  else if (a_to_b || b_to_a) relationship = "one_way_peer";

  let score_relationship: ReciprocityResult["score_relationship"] = "n/a";
  if (a_to_b && b_to_a) {
    score_relationship =
      Math.abs(a_to_b.score - b_to_a.score) <= eps
        ? "similar_scores"
        : "materially_different_scores";
  }

  return { a_to_b, b_to_a, relationship, score_relationship };
}
