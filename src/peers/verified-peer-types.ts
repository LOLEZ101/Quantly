import type { PeerType } from "../domain/types.js";
import { PHASE2_PEER_TYPES } from "../config/load-peer-weights.js";

/** Peer types that require market/pricing data not available offline. */
export const MARKET_DEPENDENT_PEER_TYPES: PeerType[] = [
  "valuation",
  "market_behavior",
];

/**
 * Default scored peer types for Phase 3.5 verified snapshots.
 * Excludes valuation and market_behavior until market/pricing data exists.
 */
export const VERIFIED_PEER_TYPES: PeerType[] = PHASE2_PEER_TYPES.filter(
  (t) => !MARKET_DEPENDENT_PEER_TYPES.includes(t)
);

export function unsupportedMarketPeerTypes(hasMarketData: boolean): PeerType[] {
  return hasMarketData ? [] : MARKET_DEPENDENT_PEER_TYPES;
}
