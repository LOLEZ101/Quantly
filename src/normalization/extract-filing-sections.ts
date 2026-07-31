export interface FilingSection {
  section_type: string;
  heading_text: string;
  extracted_text: string;
  start_offset: number;
  end_offset: number;
  extraction_confidence: number;
  extraction_method: string;
  unresolved: boolean;
}

const SECTION_PATTERNS: Array<{ type: string; patterns: RegExp[] }> = [
  {
    type: "business",
    patterns: [
      /Item\s+1\.?\s*Business/i,
      /id=["']item1["']/i,
    ],
  },
  {
    type: "competition",
    patterns: [/Competition/i],
  },
  {
    type: "risk_factors",
    patterns: [/Item\s+1A\.?\s*Risk Factors/i, /id=["']item1a["']/i],
  },
  {
    type: "segment_notes",
    patterns: [/Segment Information/i, /id=["']segments["']/i],
  },
  {
    type: "geographic_information",
    patterns: [/Geographic Information/i, /id=["']geographic["']/i],
  },
];

/**
 * Deterministic heading/anchor-based section extraction. No LLM.
 */
export function extractFilingSections(html: string): FilingSection[] {
  const sections: FilingSection[] = [];
  for (const def of SECTION_PATTERNS) {
    let start = -1;
    let heading = def.type;
    for (const pattern of def.patterns) {
      const match = pattern.exec(html);
      if (match) {
        start = match.index;
        heading = match[0].replace(/<[^>]+>/g, "").trim();
        break;
      }
    }
    if (start < 0) {
      sections.push({
        section_type: def.type,
        heading_text: "",
        extracted_text: "",
        start_offset: -1,
        end_offset: -1,
        extraction_confidence: 0,
        extraction_method: "heading_anchor_heuristic",
        unresolved: true,
      });
      continue;
    }
    const nextCandidates = SECTION_PATTERNS.map((s) => {
      for (const p of s.patterns) {
        const m = p.exec(html.slice(start + 1));
        if (m) return start + 1 + m.index;
      }
      return html.length;
    });
    const end = Math.min(...nextCandidates.filter((n) => n > start));
    const extracted = html
      .slice(start, end)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    sections.push({
      section_type: def.type,
      heading_text: heading,
      extracted_text: extracted,
      start_offset: start,
      end_offset: end,
      extraction_confidence: extracted.length > 80 ? 0.8 : 0.35,
      extraction_method: "heading_anchor_heuristic",
      unresolved: extracted.length < 40,
    });
  }
  return sections;
}
