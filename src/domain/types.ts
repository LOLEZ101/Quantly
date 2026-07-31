/** Shared Phase-2 domain types. Pilot runs in-memory against fixture files. */

export type DataQuality =
  | "reported"
  | "derived"
  | "manually_classified"
  | "illustrative";

export type PeerType =
  | "economic"
  | "valuation"
  | "competitive"
  | "custom"
  | "direct_competitor"
  | "operating"
  | "growth"
  | "risk"
  | "market_behavior";

export type EligibilityResult =
  | "eligible"
  | "eligible_with_penalty"
  | "ineligible";

export type Sp500Status = "member" | "not_member" | "unknown";

export interface QualityField<T> {
  value: T;
  quality: DataQuality;
  as_of?: string;
  note?: string;
}

export interface CompanyRecord {
  company_key: string;
  legal_name: string;
  display_name: string;
  ticker: string;
  exchange: string;
  cik: string | null;
  country_of_domicile: string;
  website: string | null;
  sp500_membership_status: Sp500Status;
  primary_business_description: QualityField<string>;
  industry_identifiers: {
    gics?: string | null;
    naics?: string | null;
  };
  is_active: boolean;
  data_as_of: string;
}

export interface BusinessSegmentRecord {
  company_key: string;
  segment_key: string;
  segment_name: string;
  node_id: string | null;
  reported_weight: number;
  quality: DataQuality;
  operating_income_weight?: number | null;
  asset_weight?: number | null;
  fiscal_year: number;
  as_of: string;
}

export interface SegmentCoverageMeta {
  company_key: string;
  coverage_ratio: number;
  unallocated_weight: number;
  is_complete: boolean;
  quality: DataQuality;
  as_of: string;
}

export interface CustomerExposureRecord {
  company_key: string;
  customer_type: string;
  weight: number;
  quality: DataQuality;
  as_of: string;
}

export interface GeographicExposureRecord {
  company_key: string;
  geo_code: string;
  geo_name: string;
  weight: number;
  quality: DataQuality;
  as_of: string;
}

export interface OperatingModelRecord {
  company_key: string;
  revenue_models: Array<{
    model_code: string;
    model_name: string;
    weight: number;
    quality: DataQuality;
  }>;
  infrastructure_models: Array<{
    model_code: string;
    model_name: string;
    weight: number;
    quality: DataQuality;
    notes?: string;
  }>;
  franchise_mix?: {
    locations_franchised_pct: QualityField<number | null>;
    revenue_franchise_associated_pct?: QualityField<number | null>;
    operating_income_franchise_associated_pct?: QualityField<number | null>;
    systemwide_sales_franchised_pct?: QualityField<number | null>;
  };
  semiconductor_model?: {
    model_code:
      | "fabless"
      | "idm"
      | "foundry"
      | "memory"
      | "analog"
      | "equipment"
      | null;
    quality: DataQuality;
  };
  as_of: string;
}

export interface EvidenceRecord {
  evidence_id: string;
  company_key: string;
  evidence_type: string;
  summary: string;
  excerpt?: string | null;
  locator?: string | null;
  source_document_uri?: string | null;
  related_node_id?: string | null;
  confidence: number;
  is_manual: boolean;
  quality: DataQuality;
  as_of: string;
}

export interface FinancialFeaturesRecord {
  company_key: string;
  as_of: string;
  currency: string;
  /** Illustrative banded features for pilot scoring — not live market data. */
  size_band: QualityField<"mega" | "large" | "mid" | "small">;
  revenue_growth_band: QualityField<"high" | "moderate" | "low" | "negative">;
  profitability_band: QualityField<"high" | "moderate" | "low" | "negative">;
  leverage_band: QualityField<"high" | "moderate" | "low">;
  capital_intensity_band: QualityField<"high" | "moderate" | "low">;
  market_cap_illustrative_usd?: QualityField<number | null>;
  revenue_ttm_illustrative_usd?: QualityField<number | null>;
}

export type OverrideAction =
  | "force_primary_classification"
  | "add_secondary_exposure"
  | "remove_secondary_exposure"
  | "add_peer"
  | "remove_peer"
  | "adjust_peer_rank"
  | "mark_relationship_reviewed"
  | "resolve_review_item";

export interface ManualOverrideRecord {
  override_id: string;
  company_key: string;
  action: OverrideAction;
  payload: Record<string, unknown>;
  rationale: string;
  reviewer: string;
  effective_from: string;
  expires_on?: string | null;
  review_by?: string | null;
  quality: "manually_classified";
}

export interface ExplicitCompetitorLink {
  company_key: string;
  competitor_company_key: string;
  quality: DataQuality;
  note?: string;
}

export interface TaxonomyNode {
  id: string;
  name: string;
  description: string;
  node_type: string;
  parent_id: string | null;
  inclusion_criteria: string[];
  exclusion_criteria: string[];
  allowed_child_node_types: string[];
  effective_date: string;
  taxonomy_version: string;
  path?: string;
  depth?: number;
}

export interface ConfidenceComponents {
  segment_coverage: number;
  evidence_completeness: number;
  source_agreement: number;
  recency: number;
  manual_review_bonus: number;
  ambiguity_penalty: number;
  final: number;
}

export interface ClassificationResult {
  company_key: string;
  taxonomy_version: string;
  effective_date: string;
  primary: {
    node_id: string;
    path: string;
    nodes: Array<{
      id: string;
      name: string;
      node_type: string;
      depth: number;
    }>;
    confidence: number;
    confidence_components: ConfidenceComponents;
    is_manual: boolean;
    primary_selection_reason: string;
    evidence_ids: string[];
  } | null;
  secondary: Array<{
    node_id: string;
    path: string;
    weight: number;
    materiality_reason: string;
    confidence: number;
    is_manual: boolean;
    evidence_ids: string[];
  }>;
  calculated_before_override?: ClassificationResult["primary"];
  coverage_ratio: number;
  unallocated_weight: number;
}

export interface ScoreComponent {
  factor_code: string;
  raw_score: number | null;
  factor_score: number;
  configured_weight: number;
  adjusted_weight: number;
  weighted_contribution: number;
  missing: boolean;
  notes: string | null;
}

export interface PeerExplanation {
  summary: string;
  similarities: string[];
  differences: string[];
  limitations: string[];
  candidate_reasons: string[];
  eligibility_notes: string[];
  why_appropriate: string;
  why_not_higher: string;
  confidence: number;
}

export interface PeerRelationshipResult {
  target_company_id: string;
  peer_company_id: string;
  peer_type: PeerType;
  score: number;
  rank: number;
  confidence: number;
  incomplete: boolean;
  is_manual: boolean;
  eligibility: EligibilityResult;
  eligibility_rule_id: string | null;
  eligibility_penalty: number;
  candidate_reasons: string[];
  components: ScoreComponent[];
  explanation: PeerExplanation;
  calculated_before_override?: {
    score: number;
    rank: number | null;
  };
}

export interface ReviewItem {
  review_item_id: string;
  company_key?: string;
  company_pair?: [string, string];
  severity: "low" | "moderate" | "high";
  reason_code: string;
  description: string;
  evidence_ids: string[];
  suggested_action: string;
  created_date: string;
  status: "pending" | "in_review" | "approved" | "rejected" | "cancelled";
}

export interface ReciprocityResult {
  a_to_b: PeerRelationshipResult | null;
  b_to_a: PeerRelationshipResult | null;
  relationship: "mutual_peer" | "one_way_peer" | "none";
  score_relationship: "similar_scores" | "materially_different_scores" | "n/a";
}
