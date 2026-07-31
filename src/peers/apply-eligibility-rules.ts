import {
  expandNodeRefs,
  type PeerEligibilityConfig,
} from "../config/load-peer-eligibility.js";
import type { EligibilityResult, PeerType } from "../domain/types.js";

export interface EligibilityDecision {
  peer_type: PeerType;
  result: EligibilityResult;
  rule_id: string | null;
  explanation: string;
  penalty: number;
}

export function applyEligibilityRules(input: {
  targetNodeId: string;
  peerNodeId: string;
  peerType: PeerType;
  config: PeerEligibilityConfig;
}): EligibilityDecision {
  const { config, peerType } = input;
  let decision: EligibilityDecision = {
    peer_type: peerType,
    result: "eligible",
    rule_id: null,
    explanation: "No specific eligibility rule matched; default eligible.",
    penalty: 0,
  };

  for (const rule of config.rules) {
    if (!rule.peer_types.includes(peerType)) continue;

    if (rule.when.same_primary_node) {
      if (input.targetNodeId === input.peerNodeId) {
        decision = {
          peer_type: peerType,
          result: rule.result,
          rule_id: rule.id,
          explanation: rule.description,
          penalty: rule.penalty ?? 0,
        };
        // same-cluster eligibility is affirmative but later rules may still penalize? 
        // Prefer first ineligible / penalty after defaults — continue to allow exclusions to win
        if (rule.result === "eligible") continue;
      } else {
        continue;
      }
    }

    const one = expandNodeRefs(config, rule.when.one_in);
    const other = expandNodeRefs(config, rule.when.other_in);
    if (one.size === 0 || other.size === 0) continue;

    const match =
      (one.has(input.targetNodeId) && other.has(input.peerNodeId)) ||
      (one.has(input.peerNodeId) && other.has(input.targetNodeId));
    if (!match) continue;

    // Ineligible wins; else keep strongest penalty
    if (rule.result === "ineligible") {
      return {
        peer_type: peerType,
        result: "ineligible",
        rule_id: rule.id,
        explanation: rule.description,
        penalty: 0,
      };
    }
    if (
      rule.result === "eligible_with_penalty" &&
      (decision.result === "eligible" ||
        (rule.penalty ?? 0) > decision.penalty)
    ) {
      decision = {
        peer_type: peerType,
        result: "eligible_with_penalty",
        rule_id: rule.id,
        explanation: rule.description,
        penalty: rule.penalty ?? 0,
      };
    }
  }

  return decision;
}
