export interface ConceptMapping {
  concept: string;
  normalized_metric: string;
  preferred_unit: string;
  version: string;
}

/** Versioned XBRL concept map — additive and testable. */
export const XBRL_CONCEPT_MAP_VERSION = "1.0.1";

export const XBRL_CONCEPT_MAP: ConceptMapping[] = [
  // US-GAAP
  { concept: "Revenues", normalized_metric: "revenue", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "RevenueFromContractWithCustomerExcludingAssessedTax", normalized_metric: "revenue", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "SalesRevenueNet", normalized_metric: "revenue", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "OperatingIncomeLoss", normalized_metric: "operating_income", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "NetIncomeLoss", normalized_metric: "net_income", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "Assets", normalized_metric: "assets", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "Liabilities", normalized_metric: "liabilities", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "LongTermDebt", normalized_metric: "long_term_debt", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "PaymentsToAcquirePropertyPlantAndEquipment", normalized_metric: "capex", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "ResearchAndDevelopmentExpense", normalized_metric: "rd_expense", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "NetCashProvidedByUsedInOperatingActivities", normalized_metric: "operating_cash_flow", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "CommonStockSharesOutstanding", normalized_metric: "shares_outstanding", preferred_unit: "shares", version: XBRL_CONCEPT_MAP_VERSION },
  // IFRS-full (e.g. foreign issuers like GFS filing 20-F)
  { concept: "Revenue", normalized_metric: "revenue", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "RevenueFromContractsWithCustomers", normalized_metric: "revenue", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "ProfitLossFromOperatingActivities", normalized_metric: "operating_income", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "ProfitLoss", normalized_metric: "net_income", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "LongtermBorrowings", normalized_metric: "long_term_debt", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "NoncurrentBorrowings", normalized_metric: "long_term_debt", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", normalized_metric: "capex", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
  { concept: "CashFlowsFromUsedInOperatingActivities", normalized_metric: "operating_cash_flow", preferred_unit: "USD", version: XBRL_CONCEPT_MAP_VERSION },
];

export function mapConcept(concept: string): ConceptMapping | null {
  return XBRL_CONCEPT_MAP.find((m) => m.concept === concept) ?? null;
}
