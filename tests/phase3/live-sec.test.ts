import { describe, expect, it } from "vitest";
import { loadEnvConfig } from "../../src/database/env.js";

const enabled = process.env.RUN_LIVE_SEC_TESTS === "true";

describe.skipIf(!enabled)("Optional live SEC tests", () => {
  it("requires SEC contact configuration and fetches live companyfacts for VZ", async () => {
    const env = loadEnvConfig();
    if (!env.secContactEmail) {
      throw new Error("SEC_CONTACT_EMAIL required when RUN_LIVE_SEC_TESTS=true");
    }
    const { LiveSecAdapter } = await import(
      "../../src/sources/sec/live-adapter.js"
    );
    const adapter = new LiveSecAdapter({
      allowOfflineFallback: false,
      requireLiveCacheUri: true,
      corpus: "verified_independent",
    });
    const resolved = await adapter.resolveCompanyIdentifiers({
      company_key: "vz",
      legal_name: "Verizon Communications Inc.",
      display_name: "Verizon",
      ticker: "VZ",
      exchange: "NYSE",
      cik: "0000732712",
    });
    expect(resolved.resolved_cik).toBeTruthy();
    expect(resolved.status).toBe("resolved");

    const facts = await adapter.fetchStructuredFinancialFacts(resolved);
    expect(facts.original_uri).toContain("data.sec.gov");
    const parsed = JSON.parse(facts.content.toString("utf8"));
    expect(parsed.facts?.["us-gaap"]).toBeTruthy();
  }, 120000);
});
