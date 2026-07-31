import type { FilingSection } from "../normalization/extract-filing-sections.js";
import type { NormalizedFinancialFact } from "../normalization/normalize-financial-fact.js";

export interface EvidenceCandidate {
  candidate_id: string;
  company_key: string;
  proposed_evidence_type: string;
  extracted_value: string | null;
  extracted_text: string;
  source_location: string;
  extraction_method: string;
  confidence: number;
  normalization_status: "raw" | "normalized";
  review_status: "pending" | "approved" | "rejected";
  source_payload_id?: string;
}

export function extractEvidenceCandidates(input: {
  companyKey: string;
  sections: FilingSection[];
  facts: NormalizedFinancialFact[];
  accessionNumber?: string;
}): EvidenceCandidate[] {
  const out: EvidenceCandidate[] = [];
  let i = 0;

  for (const section of input.sections) {
    if (section.unresolved || !section.extracted_text) continue;
    out.push({
      candidate_id: `ec_${input.companyKey}_${++i}`,
      company_key: input.companyKey,
      proposed_evidence_type: `filing_section_${section.section_type}`,
      extracted_value: null,
      extracted_text: section.extracted_text.slice(0, 1200),
      source_location: `${input.accessionNumber ?? "document"}#${section.section_type}:${section.start_offset}`,
      extraction_method: section.extraction_method,
      confidence: Math.min(1, section.extraction_confidence),
      normalization_status: "raw",
      review_status: "pending",
    });

    if (section.section_type === "business" || section.section_type === "segment_notes") {
      const segMatches = [
        ...section.extracted_text.matchAll(
          /([A-Z][A-Za-z0-9 &/-]{2,40})\s*\((\d{1,3})%\s*of revenue\)/g
        ),
      ];
      for (const m of segMatches) {
        out.push({
          candidate_id: `ec_${input.companyKey}_${++i}`,
          company_key: input.companyKey,
          proposed_evidence_type: "segment_revenue",
          extracted_value: String(Number(m[2]) / 100),
          extracted_text: m[0],
          source_location: `${input.accessionNumber ?? "document"}#segments`,
          extraction_method: "regex_segment_percentage",
          confidence: 0.75,
          normalization_status: "normalized",
          review_status: "pending",
        });
      }

      const franchise = section.extracted_text.match(
        /approximately\s+(\d{1,3})%\s+of system restaurants were franchised/i
      );
      if (franchise) {
        out.push({
          candidate_id: `ec_${input.companyKey}_${++i}`,
          company_key: input.companyKey,
          proposed_evidence_type: "franchise_locations_pct",
          extracted_value: String(Number(franchise[1]) / 100),
          extracted_text: franchise[0],
          source_location: `${input.accessionNumber ?? "document"}#business`,
          extraction_method: "regex_franchise_locations",
          confidence: 0.85,
          normalization_status: "normalized",
          review_status: "pending",
        });
      }

      if (/outsource manufacturing to foundries/i.test(section.extracted_text)) {
        out.push({
          candidate_id: `ec_${input.companyKey}_${++i}`,
          company_key: input.companyKey,
          proposed_evidence_type: "semiconductor_model_fabless",
          extracted_value: "fabless",
          extracted_text:
            "We design semiconductors and outsource manufacturing to foundries.",
          source_location: `${input.accessionNumber ?? "document"}#business`,
          extraction_method: "regex_business_model",
          confidence: 0.9,
          normalization_status: "normalized",
          review_status: "pending",
        });
      }
      if (/captive fabrication facilities/i.test(section.extracted_text)) {
        out.push({
          candidate_id: `ec_${input.companyKey}_${++i}`,
          company_key: input.companyKey,
          proposed_evidence_type: "semiconductor_model_idm",
          extracted_value: "idm",
          extracted_text: section.extracted_text.slice(0, 240),
          source_location: `${input.accessionNumber ?? "document"}#business`,
          extraction_method: "regex_business_model",
          confidence: 0.9,
          normalization_status: "normalized",
          review_status: "pending",
        });
      }
      if (/pure-play foundry/i.test(section.extracted_text)) {
        out.push({
          candidate_id: `ec_${input.companyKey}_${++i}`,
          company_key: input.companyKey,
          proposed_evidence_type: "semiconductor_model_foundry",
          extracted_value: "foundry",
          extracted_text: section.extracted_text.slice(0, 240),
          source_location: `${input.accessionNumber ?? "document"}#business`,
          extraction_method: "regex_business_model",
          confidence: 0.9,
          normalization_status: "normalized",
          review_status: "pending",
        });
      }
      if (/wafer fabrication equipment/i.test(section.extracted_text)) {
        out.push({
          candidate_id: `ec_${input.companyKey}_${++i}`,
          company_key: input.companyKey,
          proposed_evidence_type: "semiconductor_model_equipment",
          extracted_value: "equipment",
          extracted_text: section.extracted_text.slice(0, 240),
          source_location: `${input.accessionNumber ?? "document"}#business`,
          extraction_method: "regex_business_model",
          confidence: 0.9,
          normalization_status: "normalized",
          review_status: "pending",
        });
      }
      if (/lease communications sites|tower and infrastructure/i.test(section.extracted_text)) {
        out.push({
          candidate_id: `ec_${input.companyKey}_${++i}`,
          company_key: input.companyKey,
          proposed_evidence_type: "infrastructure_landlord",
          extracted_value: "infra_landlord",
          extracted_text: section.extracted_text.slice(0, 240),
          source_location: `${input.accessionNumber ?? "document"}#business`,
          extraction_method: "regex_business_model",
          confidence: 0.9,
          normalization_status: "normalized",
          review_status: "pending",
        });
      }
      if (/nationwide wireless|wireless network operator|wireless carriers/i.test(section.extracted_text)) {
        out.push({
          candidate_id: `ec_${input.companyKey}_${++i}`,
          company_key: input.companyKey,
          proposed_evidence_type: "network_owner",
          extracted_value: "network_owner",
          extracted_text: section.extracted_text.slice(0, 240),
          source_location: `${input.accessionNumber ?? "document"}#business`,
          extraction_method: "regex_business_model",
          confidence: 0.8,
          normalization_status: "normalized",
          review_status: "pending",
        });
      }
    }

    if (section.section_type === "competition") {
      const names = [
        "AT&T",
        "T-Mobile",
        "Verizon",
        "McDonald",
        "Yum",
        "Domino",
        "Chipotle",
        "Starbucks",
        "AMD",
        "NVIDIA",
        "Intel",
        "American Tower",
        "Crown Castle",
      ];
      for (const name of names) {
        if (section.extracted_text.includes(name)) {
          out.push({
            candidate_id: `ec_${input.companyKey}_${++i}`,
            company_key: input.companyKey,
            proposed_evidence_type: "named_competitor",
            extracted_value: name,
            extracted_text: section.extracted_text.slice(0, 400),
            source_location: `${input.accessionNumber ?? "document"}#competition`,
            extraction_method: "named_entity_scan",
            confidence: 0.7,
            normalization_status: "normalized",
            review_status: "pending",
          });
        }
      }
    }
  }

  for (const fact of input.facts.filter((f) => f.is_segment === false && f.normalized_metric)) {
    if (!["revenue", "operating_income", "assets"].includes(fact.normalized_metric!)) continue;
    out.push({
      candidate_id: `ec_${input.companyKey}_${++i}`,
      company_key: input.companyKey,
      proposed_evidence_type: `xbrl_${fact.normalized_metric}`,
      extracted_value: String(fact.value_numeric),
      extracted_text: `${fact.concept}=${fact.value_numeric} ${fact.unit} end=${fact.end_date}`,
      source_location: `xbrl:${fact.accession_number}:${fact.concept}`,
      extraction_method: "xbrl_companyfacts",
      confidence: fact.data_quality_status === "normalized" ? 0.9 : 0.4,
      normalization_status:
        fact.data_quality_status === "normalized" ? "normalized" : "raw",
      review_status: "pending",
    });
  }

  return out;
}
