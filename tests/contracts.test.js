import { readFileSync, readdirSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  classificationHasValidEvidence,
  loadJson,
  repoPath,
} from "./helpers/load-config.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

function compile(schemaPath) {
  return ajv.compile(loadJson(schemaPath));
}

const validators = {
  taxonomy: compile("contracts/taxonomy.schema.json"),
  companyProfile: compile("contracts/company-profile.schema.json"),
  companyClassification: compile("contracts/company-classification.schema.json"),
  peerResponse: compile("contracts/peer-response.schema.json"),
  snapshotManifest: compile("contracts/snapshot-manifest.schema.json"),
};

function expectValid(validate, data) {
  const ok = validate(data);
  if (!ok) {
    throw new Error(ajv.errorsText(validate.errors, { dataVar: "payload" }));
  }
  expect(ok).toBe(true);
}

describe("JSON Schema contracts compile", () => {
  it("loads every contract file as JSON Schema", () => {
    const files = readdirSync(repoPath("contracts")).filter((f) =>
      f.endsWith(".schema.json")
    );
    expect(files.sort()).toEqual(
      [
        "company-classification.schema.json",
        "company-profile.schema.json",
        "peer-response.schema.json",
        "snapshot-manifest.schema.json",
        "taxonomy.schema.json",
      ].sort()
    );
    for (const file of files) {
      const schema = loadJson(`contracts/${file}`);
      expect(schema.$schema).toMatch(/json-schema/);
      const isolated = new Ajv2020({ allErrors: true, strict: false });
      addFormats(isolated);
      expect(() => isolated.compile(schema)).not.toThrow();
    }
  });
});

describe("valid fixtures satisfy contracts", () => {
  it("taxonomy tree and children responses", () => {
    expectValid(
      validators.taxonomy,
      loadJson("tests/fixtures/taxonomy-tree.valid.json")
    );
    expectValid(
      validators.taxonomy,
      loadJson("tests/fixtures/taxonomy-children.valid.json")
    );
  });

  it("company profile response", () => {
    expectValid(
      validators.companyProfile,
      loadJson("tests/fixtures/company-profile.valid.json")
    );
  });

  it("company classification responses", () => {
    const automated = loadJson(
      "tests/fixtures/company-classification.valid.json"
    );
    expectValid(validators.companyClassification, automated);
    expect(classificationHasValidEvidence(automated)).toBe(true);

    const manual = loadJson(
      "tests/fixtures/company-classification.manual.valid.json"
    );
    expectValid(validators.companyClassification, manual);
  });

  it("peer response", () => {
    expectValid(
      validators.peerResponse,
      loadJson("tests/fixtures/peer-response.valid.json")
    );
  });

  it("snapshot manifest", () => {
    expectValid(
      validators.snapshotManifest,
      loadJson("tests/fixtures/snapshot-manifest.valid.json")
    );
  });
});

describe("invalid payloads are rejected", () => {
  it("rejects peer scores outside [0, 1]", () => {
    const payload = loadJson("tests/fixtures/peer-response.valid.json");
    payload.peers[0].score = 1.2;
    expect(validators.peerResponse(payload)).toBe(false);
  });

  it("rejects taxonomy nodes missing inclusion criteria", () => {
    const payload = loadJson("tests/fixtures/taxonomy-tree.valid.json");
    delete payload.root.inclusion_criteria;
    expect(validators.taxonomy(payload)).toBe(false);
  });

  it("rejects automated classification fixtures that omit evidence via business rule", () => {
    const invalid = loadJson(
      "tests/fixtures/company-classification.invalid-no-evidence.json"
    );
    // Schema may still parse structurally; evidence rule is enforced explicitly.
    expect(classificationHasValidEvidence(invalid)).toBe(false);
    expect(validators.companyClassification(invalid)).toBe(false);
  });

  it("rejects mutable snapshot manifests", () => {
    const payload = loadJson("tests/fixtures/snapshot-manifest.valid.json");
    payload.is_immutable = false;
    expect(validators.snapshotManifest(payload)).toBe(false);
  });
});

describe("schema files are non-empty well-formed JSON", () => {
  it("reads contracts from disk", () => {
    const raw = readFileSync(
      repoPath("contracts/taxonomy.schema.json"),
      "utf8"
    );
    expect(raw.length).toBeGreaterThan(100);
    expect(JSON.parse(raw).title).toBe("TaxonomyResponse");
  });
});
