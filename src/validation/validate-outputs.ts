import { createAjv, loadSchema } from "./ajv.js";
import type {
  ClassificationResult,
  PeerRelationshipResult,
} from "../domain/types.js";

export function validateClassificationContractShape(
  payload: unknown
): string[] {
  const ajv = createAjv();
  const validate = ajv.compile(loadSchema("contracts/company-classification.schema.json"));
  const ok = validate(payload);
  return ok ? [] : (validate.errors ?? []).map((e) => ajv.errorsText([e]));
}

export function validatePeerContractShape(payload: unknown): string[] {
  const ajv = createAjv();
  const validate = ajv.compile(loadSchema("contracts/peer-response.schema.json"));
  const ok = validate(payload);
  return ok ? [] : (validate.errors ?? []).map((e) => ajv.errorsText([e]));
}

export function validateSnapshotManifest(payload: unknown): string[] {
  const ajv = createAjv();
  const validate = ajv.compile(loadSchema("contracts/snapshot-manifest.schema.json"));
  const ok = validate(payload);
  return ok ? [] : (validate.errors ?? []).map((e) => ajv.errorsText([e]));
}

export function validatePeerScores(
  peers: PeerRelationshipResult[]
): string[] {
  const errors: string[] = [];
  for (const p of peers) {
    if (p.score < 0 || p.score > 1) {
      errors.push(`Peer score out of range: ${p.target_company_id}->${p.peer_company_id}`);
    }
  }
  return errors;
}

export function validateOnePrimary(
  classifications: ClassificationResult[]
): string[] {
  // Structural: each result has at most one primary object
  return classifications
    .filter((c) => Array.isArray((c as unknown as { primary: unknown }).primary))
    .map((c) => `${c.company_key} primary malformed`);
}
