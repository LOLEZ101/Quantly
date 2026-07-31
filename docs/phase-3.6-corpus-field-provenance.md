# Corpus Field Provenance (Phase 3.6)

Machine-readable catalog: `src/verified/corpus-field-provenance.ts`.

## Origin classes

| Origin | Meaning |
|--------|---------|
| `hand_authored_offline_approximation` | Written for offline verification; approximate public figures / labels |
| `public_identifier_convention` | Ticker / CIK / registrant / exchange as commonly published |
| `hand_authored_disclosure_paraphrase` | Paraphrased Item 1 / competition style text for extraction tests |
| `derived_at_fixture_generation` | Reserved for generator-only derived fields |

## SEC authority support

| Support | Meaning |
|---------|---------|
| `supported_by_sec_companyfacts_concept` | Replaceable by live `companyfacts` us-gaap concepts |
| `supported_by_sec_submissions_identifier` | Confirmable via submissions JSON |
| `supported_by_sec_filing_text_extraction` | Requires filing HTML/text (Item 1, notes) |
| `not_an_sec_structured_field` | Internal key only |

## Explicit non-claims

- Corpus values are **not** copied from Phase-2 `data/pilot/business-segments.json` / `operating-models.json`.
- Corpus values are **not** live EDGAR payloads until a live ingestion run replaces them.
- Taxonomy node mappings used downstream remain curated judgments outside this corpus file.
