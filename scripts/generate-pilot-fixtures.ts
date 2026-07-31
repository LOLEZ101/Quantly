/**
 * Generates manually curated Phase-2 pilot fixtures under data/pilot/.
 * Values are labeled reported | derived | manually_classified | illustrative.
 * Illustrative financial bands are NOT live market data.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data/pilot");
const AS_OF = "2026-06-30";

type Q = "reported" | "derived" | "manually_classified" | "illustrative";

interface Co {
  key: string;
  legal: string;
  display: string;
  ticker: string;
  exchange?: string;
  cik?: string | null;
  sp500: "member" | "not_member" | "unknown";
  desc: string;
  gics?: string;
  segments: Array<{
    key: string;
    name: string;
    node: string | null;
    w: number;
    oi?: number;
    q?: Q;
  }>;
  coverage?: number;
  customers: Array<[string, number]>;
  geos: Array<[string, string, number]>;
  revenue: Array<[string, string, number]>;
  infra: Array<[string, string, number, string?]>;
  franchise?: {
    loc: number | null;
    rev?: number | null;
    oi?: number | null;
    sys?: number | null;
    q?: Q;
  };
  semi?: "fabless" | "idm" | "foundry" | "memory" | "analog" | "equipment";
  size: "mega" | "large" | "mid" | "small";
  growth: "high" | "moderate" | "low" | "negative";
  profit: "high" | "moderate" | "low" | "negative";
  leverage: "high" | "moderate" | "low";
  capex: "high" | "moderate" | "low";
  evidence: string[];
  competitors?: string[];
}

const companies: Co[] = [
  // ── Telecom ──────────────────────────────────────────────
  {
    key: "vz",
    legal: "Verizon Communications Inc.",
    display: "Verizon",
    ticker: "VZ",
    cik: "0000732712",
    sp500: "member",
    desc: "Nationwide US wireless network owner with consumer and enterprise connectivity services.",
    gics: "50101020",
    segments: [
      { key: "wireless", name: "Wireless", node: "national_wireless_network_owners", w: 0.78, oi: 0.82 },
      { key: "wireline", name: "Wireline / Business", node: "enterprise_network_and_connectivity", w: 0.22, oi: 0.18 },
    ],
    customers: [["consumer", 0.72], ["enterprise", 0.28]],
    geos: [["US", "United States", 0.96], ["OTHER", "Other", 0.04]],
    revenue: [["subscription_service", "Subscription Service", 0.9], ["equipment", "Equipment", 0.1]],
    infra: [["network_owner", "Network Owner", 1.0, "Owns spectrum and RAN"]],
    size: "mega", growth: "low", profit: "moderate", leverage: "high", capex: "high",
    evidence: ["Facilities-based national wireless carrier owning spectrum and RAN.", "Material enterprise/wireline segment alongside wireless."],
    competitors: ["t", "tmus"],
  },
  {
    key: "t",
    legal: "AT&T Inc.",
    display: "AT&T",
    ticker: "T",
    cik: "0000732717",
    sp500: "member",
    desc: "Integrated US telecom with national wireless and substantial wireline/fiber operations.",
    segments: [
      { key: "mobility", name: "Communications Mobility", node: "national_wireless_network_owners", w: 0.62, oi: 0.7 },
      { key: "wireline_fiber", name: "Wireline / Fiber", node: "integrated_incumbent_telcos", w: 0.28, oi: 0.22 },
      { key: "other", name: "Other", node: null, w: 0.1, oi: 0.08 },
    ],
    customers: [["consumer", 0.65], ["enterprise", 0.35]],
    geos: [["US", "United States", 0.95], ["OTHER", "Other", 0.05]],
    revenue: [["subscription_service", "Subscription Service", 0.92], ["other", "Other", 0.08]],
    infra: [["network_owner", "Network Owner", 1.0]],
    size: "mega", growth: "low", profit: "moderate", leverage: "high", capex: "high",
    evidence: ["National wireless network owner with incumbent wireline/fiber franchise."],
    competitors: ["vz", "tmus"],
  },
  {
    key: "tmus",
    legal: "T-Mobile US, Inc.",
    display: "T-Mobile US",
    ticker: "TMUS",
    cik: "0001283699",
    sp500: "member",
    desc: "National US wireless network operator focused primarily on mobile services.",
    segments: [
      { key: "wireless", name: "Wireless", node: "national_wireless_network_owners", w: 0.97, oi: 0.98 },
      { key: "other", name: "Other", node: null, w: 0.03, oi: 0.02 },
    ],
    customers: [["consumer", 0.85], ["enterprise", 0.15]],
    geos: [["US", "United States", 1.0]],
    revenue: [["subscription_service", "Subscription Service", 0.88], ["equipment", "Equipment", 0.12]],
    infra: [["network_owner", "Network Owner", 1.0]],
    size: "mega", growth: "moderate", profit: "moderate", leverage: "moderate", capex: "high",
    evidence: ["Nationwide facilities-based wireless carrier."],
    competitors: ["vz", "t"],
  },
  {
    key: "cmcsa",
    legal: "Comcast Corporation",
    display: "Comcast",
    ticker: "CMCSA",
    cik: "0001166691",
    sp500: "member",
    desc: "US cable broadband and media conglomerate; connectivity economics driven by HFC broadband.",
    segments: [
      { key: "connectivity", name: "Connectivity & Platforms", node: "cable_broadband_operators", w: 0.55, oi: 0.7 },
      { key: "media", name: "Media / Theme Parks", node: null, w: 0.45, oi: 0.3 },
    ],
    customers: [["consumer", 0.8], ["enterprise", 0.2]],
    geos: [["US", "United States", 0.85], ["OTHER", "Other", 0.15]],
    revenue: [["subscription_service", "Subscription Service", 0.7], ["advertising_content", "Advertising/Content", 0.3]],
    infra: [["network_owner", "Network Owner", 0.7, "Cable HFC"], ["content_platform", "Content Platform", 0.3]],
    size: "mega", growth: "low", profit: "moderate", leverage: "moderate", capex: "high",
    evidence: ["Cable broadband is the core connectivity franchise; media is a material secondary business."],
  },
  {
    key: "chtr",
    legal: "Charter Communications, Inc.",
    display: "Charter Communications",
    ticker: "CHTR",
    cik: "0001091667",
    sp500: "member",
    desc: "US cable broadband operator (Spectrum) focused on residential and SMB connectivity.",
    segments: [
      { key: "internet", name: "Internet", node: "cable_broadband_operators", w: 0.55, oi: 0.6 },
      { key: "video_voice", name: "Video / Voice / Mobile", node: "cable_broadband_operators", w: 0.4, oi: 0.35 },
      { key: "other", name: "Other", node: null, w: 0.05, oi: 0.05 },
    ],
    customers: [["consumer", 0.88], ["enterprise", 0.12]],
    geos: [["US", "United States", 1.0]],
    revenue: [["subscription_service", "Subscription Service", 1.0]],
    infra: [["network_owner", "Network Owner", 1.0, "HFC cable"]],
    size: "large", growth: "low", profit: "moderate", leverage: "high", capex: "high",
    evidence: ["Spectrum cable broadband operator; mobile is MVNO attach, not facilities wireless primary."],
  },
  {
    key: "cci",
    legal: "Crown Castle Inc.",
    display: "Crown Castle",
    ticker: "CCI",
    cik: "0001051470",
    sp500: "member",
    desc: "US telecom infrastructure company owning towers and fiber for carrier tenants.",
    segments: [
      { key: "towers", name: "Towers", node: "tower_and_macro_site_operators", w: 0.7, oi: 0.75 },
      { key: "fiber", name: "Fiber", node: "wholesale_fiber_and_backhaul", w: 0.3, oi: 0.25 },
    ],
    customers: [["enterprise", 0.95], ["consumer", 0.05]],
    geos: [["US", "United States", 1.0]],
    revenue: [["lease_rental", "Lease / Rental", 0.9], ["services", "Services", 0.1]],
    infra: [["infra_landlord", "Infrastructure Landlord", 1.0, "Towers and fiber leased to carriers"]],
    size: "large", growth: "low", profit: "moderate", leverage: "high", capex: "moderate",
    evidence: ["Tower and shared infrastructure landlord; not a retail network operator."],
  },
  {
    key: "amt",
    legal: "American Tower Corporation",
    display: "American Tower",
    ticker: "AMT",
    cik: "0001053507",
    sp500: "member",
    desc: "Global telecom tower landlord leasing macro sites to wireless carriers.",
    segments: [
      { key: "towers", name: "Tower / Communications Sites", node: "tower_and_macro_site_operators", w: 0.92, oi: 0.95 },
      { key: "other", name: "Other", node: null, w: 0.08, oi: 0.05 },
    ],
    customers: [["enterprise", 0.97], ["consumer", 0.03]],
    geos: [["US", "United States", 0.45], ["OTHER", "International", 0.55]],
    revenue: [["lease_rental", "Lease / Rental", 0.95], ["services", "Services", 0.05]],
    infra: [["infra_landlord", "Infrastructure Landlord", 1.0]],
    size: "mega", growth: "moderate", profit: "moderate", leverage: "high", capex: "moderate",
    evidence: ["Pure-play tower landlord serving wireless carriers as tenants."],
  },
  // ── Restaurants ──────────────────────────────────────────
  {
    key: "mcd",
    legal: "McDonald's Corporation",
    display: "McDonald's",
    ticker: "MCD",
    cik: "0000063908",
    sp500: "member",
    desc: "Global QSR brand with a franchise-heavy system and significant franchise revenues.",
    segments: [
      { key: "franchised", name: "Franchised restaurants", node: "qsr_franchise_heavy", w: 0.6, oi: 0.85 },
      { key: "company", name: "Company-operated restaurants", node: "qsr_franchise_heavy", w: 0.4, oi: 0.15 },
    ],
    customers: [["consumer", 1.0]],
    geos: [["US", "United States", 0.4], ["OTHER", "International", 0.6]],
    revenue: [["franchise_royalties", "Franchise royalties & fees", 0.55], ["company_restaurant_sales", "Company restaurant sales", 0.45]],
    infra: [["franchise_system", "Franchise System", 0.85], ["company_ops", "Company Operated", 0.15]],
    franchise: { loc: 0.95, rev: 0.45, oi: 0.85, sys: 0.95, q: "derived" },
    size: "mega", growth: "moderate", profit: "high", leverage: "moderate", capex: "low",
    evidence: ["Approximately 95% of restaurants franchised; franchise economics dominate operating income."],
    competitors: ["yum", "qsr"],
  },
  {
    key: "sbux",
    legal: "Starbucks Corporation",
    display: "Starbucks",
    ticker: "SBUX",
    cik: "0000829224",
    sp500: "member",
    desc: "Global coffeehouse chain with a predominantly company-operated store model in key markets.",
    segments: [
      { key: "na", name: "North America", node: "qsr_company_operated", w: 0.7, oi: 0.75 },
      { key: "intl", name: "International", node: "qsr_company_operated", w: 0.25, oi: 0.2 },
      { key: "channel", name: "Channel Development", node: null, w: 0.05, oi: 0.05 },
    ],
    customers: [["consumer", 1.0]],
    geos: [["US", "United States", 0.7], ["OTHER", "International", 0.3]],
    revenue: [["company_restaurant_sales", "Company store sales", 0.85], ["licensed", "Licensed / other", 0.15]],
    infra: [["company_ops", "Company Operated", 0.8], ["licensed_stores", "Licensed Stores", 0.2]],
    franchise: { loc: 0.45, rev: 0.15, oi: 0.1, sys: 0.45, q: "illustrative" },
    size: "mega", growth: "moderate", profit: "moderate", leverage: "moderate", capex: "moderate",
    evidence: ["Company-operated model predominates in US; licensed stores material internationally."],
  },
  {
    key: "cmg",
    legal: "Chipotle Mexican Grill, Inc.",
    display: "Chipotle",
    ticker: "CMG",
    cik: "0001058090",
    sp500: "member",
    desc: "Fast-casual restaurant company operating nearly all restaurants as company-owned.",
    segments: [
      { key: "restaurants", name: "Restaurant sales", node: "fast_casual_company_operated", w: 1.0, oi: 1.0 },
    ],
    customers: [["consumer", 1.0]],
    geos: [["US", "United States", 0.97], ["OTHER", "Other", 0.03]],
    revenue: [["company_restaurant_sales", "Company restaurant sales", 1.0]],
    infra: [["company_ops", "Company Operated", 1.0]],
    franchise: { loc: 0.0, rev: 0.0, oi: 0.0, sys: 0.0, q: "reported" },
    size: "large", growth: "high", profit: "high", leverage: "low", capex: "moderate",
    evidence: ["Virtually 100% company-operated fast-casual model."],
  },
  {
    key: "yum",
    legal: "Yum! Brands, Inc.",
    display: "Yum! Brands",
    ticker: "YUM",
    cik: "0001041061",
    sp500: "member",
    desc: "Asset-light global QSR franchisor (KFC, Taco Bell, Pizza Hut).",
    segments: [
      { key: "franchise", name: "Franchise and property revenues", node: "restaurant_franchisors_asset_light", w: 0.85, oi: 0.92 },
      { key: "company", name: "Company sales", node: "qsr_franchise_heavy", w: 0.15, oi: 0.08 },
    ],
    customers: [["consumer", 1.0]],
    geos: [["US", "United States", 0.45], ["OTHER", "International", 0.55]],
    revenue: [["franchise_royalties", "Franchise royalties & fees", 0.85], ["company_restaurant_sales", "Company sales", 0.15]],
    infra: [["franchise_system", "Franchise System", 0.95], ["company_ops", "Company Operated", 0.05]],
    franchise: { loc: 0.98, rev: 0.85, oi: 0.92, sys: 0.98, q: "derived" },
    size: "large", growth: "moderate", profit: "high", leverage: "high", capex: "low",
    evidence: ["Highly franchised, royalty-centric QSR franchisor."],
    competitors: ["mcd", "qsr"],
  },
  {
    key: "dpz",
    legal: "Domino's Pizza, Inc.",
    display: "Domino's",
    ticker: "DPZ",
    cik: "0001286681",
    sp500: "member",
    desc: "Global pizza QSR with a franchise-heavy system.",
    segments: [
      { key: "us_stores", name: "U.S. stores", node: "qsr_franchise_heavy", w: 0.55, oi: 0.5 },
      { key: "intl", name: "International franchise", node: "qsr_franchise_heavy", w: 0.3, oi: 0.35 },
      { key: "supply", name: "Supply chain", node: "qsr_franchise_heavy", w: 0.15, oi: 0.15 },
    ],
    customers: [["consumer", 1.0]],
    geos: [["US", "United States", 0.55], ["OTHER", "International", 0.45]],
    revenue: [["franchise_royalties", "Franchise & supply", 0.7], ["company_restaurant_sales", "Company stores", 0.3]],
    infra: [["franchise_system", "Franchise System", 0.9], ["company_ops", "Company Operated", 0.1]],
    franchise: { loc: 0.98, rev: 0.65, oi: 0.8, sys: 0.98, q: "derived" },
    size: "large", growth: "moderate", profit: "high", leverage: "high", capex: "low",
    evidence: ["Franchise-heavy pizza QSR with supply-chain revenues tied to franchisees."],
  },
  {
    key: "dri",
    legal: "Darden Restaurants, Inc.",
    display: "Darden Restaurants",
    ticker: "DRI",
    cik: "0000940944",
    sp500: "member",
    desc: "Full-service casual dining company operating Olive Garden and related brands.",
    segments: [
      { key: "olive_garden", name: "Olive Garden", node: "casual_dining", w: 0.55, oi: 0.6 },
      { key: "other_brands", name: "Other brands", node: "casual_dining", w: 0.45, oi: 0.4 },
    ],
    customers: [["consumer", 1.0]],
    geos: [["US", "United States", 0.98], ["OTHER", "Other", 0.02]],
    revenue: [["company_restaurant_sales", "Company restaurant sales", 1.0]],
    infra: [["company_ops", "Company Operated", 1.0]],
    franchise: { loc: 0.0, rev: 0.0, oi: 0.0, sys: 0.0, q: "reported" },
    size: "large", growth: "moderate", profit: "moderate", leverage: "moderate", capex: "moderate",
    evidence: ["Company-operated casual dining portfolio."],
  },
  {
    key: "qsr",
    legal: "Restaurant Brands International Inc.",
    display: "Restaurant Brands International",
    ticker: "QSR",
    exchange: "NYSE",
    cik: "0001618756",
    sp500: "member",
    desc: "Asset-light franchisor of Burger King, Tim Hortons, and Popeyes.",
    segments: [
      { key: "franchise", name: "Franchise revenues", node: "restaurant_franchisors_asset_light", w: 0.9, oi: 0.95 },
      { key: "other", name: "Other", node: null, w: 0.1, oi: 0.05 },
    ],
    customers: [["consumer", 1.0]],
    geos: [["US", "United States", 0.5], ["OTHER", "International", 0.5]],
    revenue: [["franchise_royalties", "Franchise royalties & fees", 0.9], ["other", "Other", 0.1]],
    infra: [["franchise_system", "Franchise System", 1.0]],
    franchise: { loc: 0.95, rev: 0.9, oi: 0.95, sys: 0.95, q: "derived" },
    size: "large", growth: "moderate", profit: "high", leverage: "high", capex: "low",
    evidence: ["Royalty-driven multi-brand QSR franchisor."],
    competitors: ["yum", "mcd"],
  },
  {
    key: "txrh",
    legal: "Texas Roadhouse, Inc.",
    display: "Texas Roadhouse",
    ticker: "TXRH",
    cik: "0001289460",
    sp500: "member",
    desc: "Casual dining steakhouse chain that is primarily company-operated.",
    segments: [
      { key: "company", name: "Company restaurants", node: "casual_dining", w: 0.9, oi: 0.92 },
      { key: "franchise", name: "Franchise", node: "casual_dining", w: 0.1, oi: 0.08 },
    ],
    customers: [["consumer", 1.0]],
    geos: [["US", "United States", 0.95], ["OTHER", "Other", 0.05]],
    revenue: [["company_restaurant_sales", "Company restaurant sales", 0.92], ["franchise_royalties", "Franchise", 0.08]],
    infra: [["company_ops", "Company Operated", 0.9], ["franchise_system", "Franchise System", 0.1]],
    franchise: { loc: 0.1, rev: 0.08, oi: 0.08, sys: 0.1, q: "illustrative" },
    size: "mid", growth: "moderate", profit: "moderate", leverage: "low", capex: "moderate",
    evidence: ["Primarily company-operated casual dining."],
  },
  // ── Semiconductors ───────────────────────────────────────
  {
    key: "nvda",
    legal: "NVIDIA Corporation",
    display: "NVIDIA",
    ticker: "NVDA",
    cik: "0001045810",
    sp500: "member",
    desc: "Fabless designer of GPUs and accelerated computing platforms for data center and AI.",
    segments: [
      { key: "compute", name: "Compute / Data Center", node: "fabless_compute_and_ai_accelerators", w: 0.8, oi: 0.88 },
      { key: "gaming", name: "Gaming / Other", node: "fabless_compute_and_ai_accelerators", w: 0.2, oi: 0.12 },
    ],
    customers: [["enterprise", 0.85], ["consumer", 0.15]],
    geos: [["US", "United States", 0.45], ["OTHER", "International", 0.55]],
    revenue: [["product_sales", "Semiconductor product sales", 1.0]],
    infra: [["fabless_design", "Fabless Design", 1.0]],
    semi: "fabless",
    size: "mega", growth: "high", profit: "high", leverage: "low", capex: "low",
    evidence: ["Fabless GPU/AI accelerator leader; manufacturing outsourced to foundries."],
    competitors: ["amd"],
  },
  {
    key: "amd",
    legal: "Advanced Micro Devices, Inc.",
    display: "AMD",
    ticker: "AMD",
    cik: "0000002488",
    sp500: "member",
    desc: "Fabless designer of CPUs, GPUs, and data-center accelerators.",
    segments: [
      { key: "data_center", name: "Data Center", node: "fabless_compute_and_ai_accelerators", w: 0.45, oi: 0.5 },
      { key: "client", name: "Client", node: "fabless_compute_and_ai_accelerators", w: 0.3, oi: 0.25 },
      { key: "gaming", name: "Gaming", node: "fabless_compute_and_ai_accelerators", w: 0.15, oi: 0.15 },
      { key: "embedded", name: "Embedded", node: "fabless_compute_and_ai_accelerators", w: 0.1, oi: 0.1 },
    ],
    customers: [["enterprise", 0.6], ["consumer", 0.4]],
    geos: [["US", "United States", 0.3], ["OTHER", "International", 0.7]],
    revenue: [["product_sales", "Semiconductor product sales", 1.0]],
    infra: [["fabless_design", "Fabless Design", 1.0]],
    semi: "fabless",
    size: "mega", growth: "high", profit: "moderate", leverage: "low", capex: "low",
    evidence: ["Fabless compute GPU/CPU peer to NVIDIA in accelerated computing."],
    competitors: ["nvda", "intc"],
  },
  {
    key: "intc",
    legal: "Intel Corporation",
    display: "Intel",
    ticker: "INTC",
    cik: "0000050863",
    sp500: "member",
    desc: "Integrated device manufacturer designing CPUs and operating captive fabs, with foundry ambitions.",
    segments: [
      { key: "cgg", name: "Client Computing", node: "integrated_device_manufacturers", w: 0.4, oi: 0.35 },
      { key: "dca", name: "Data Center & AI", node: "integrated_device_manufacturers", w: 0.3, oi: 0.25 },
      { key: "foundry", name: "Intel Foundry", node: "semiconductor_foundries", w: 0.15, oi: 0.1 },
      { key: "other", name: "Other", node: "integrated_device_manufacturers", w: 0.15, oi: 0.3 },
    ],
    customers: [["enterprise", 0.55], ["consumer", 0.45]],
    geos: [["US", "United States", 0.25], ["OTHER", "International", 0.75]],
    revenue: [["product_sales", "Semiconductor product sales", 0.9], ["foundry_services", "Foundry services", 0.1]],
    infra: [["idm_manufacturing", "IDM Manufacturing", 0.85], ["foundry_capacity", "Foundry Capacity", 0.15]],
    semi: "idm",
    size: "mega", growth: "negative", profit: "low", leverage: "moderate", capex: "high",
    evidence: ["IDM with captive manufacturing; product competitor to fabless CPU/GPU vendors but different operating model."],
    competitors: ["amd"],
  },
  {
    key: "avgo",
    legal: "Broadcom Inc.",
    display: "Broadcom",
    ticker: "AVGO",
    cik: "0001730168",
    sp500: "member",
    desc: "Diversified semiconductor and infrastructure software company with leading networking silicon.",
    segments: [
      { key: "semi", name: "Semiconductor solutions", node: "fabless_connectivity_and_networking", w: 0.75, oi: 0.8 },
      { key: "software", name: "Infrastructure software", node: null, w: 0.25, oi: 0.2 },
    ],
    customers: [["enterprise", 0.9], ["consumer", 0.1]],
    geos: [["US", "United States", 0.3], ["OTHER", "International", 0.7]],
    revenue: [["product_sales", "Semiconductor product sales", 0.75], ["software_subscription", "Software", 0.25]],
    infra: [["fabless_design", "Fabless Design", 0.8], ["software_ip", "Software IP", 0.2]],
    semi: "fabless",
    size: "mega", growth: "moderate", profit: "high", leverage: "moderate", capex: "low",
    evidence: ["Fabless networking/connectivity silicon with material software segment."],
  },
  {
    key: "qcom",
    legal: "QUALCOMM Incorporated",
    display: "Qualcomm",
    ticker: "QCOM",
    cik: "0000804328",
    sp500: "member",
    desc: "Fabless mobile and connectivity SoC designer with licensing franchise.",
    segments: [
      { key: "qct", name: "QCT (chips)", node: "fabless_mobile_and_consumer_soc", w: 0.8, oi: 0.65 },
      { key: "qtl", name: "QTL (licensing)", node: "fabless_mobile_and_consumer_soc", w: 0.2, oi: 0.35 },
    ],
    customers: [["enterprise", 0.2], ["consumer", 0.8]],
    geos: [["US", "United States", 0.2], ["OTHER", "International", 0.8]],
    revenue: [["product_sales", "Chip sales", 0.8], ["licensing", "Licensing", 0.2]],
    infra: [["fabless_design", "Fabless Design", 1.0]],
    semi: "fabless",
    size: "mega", growth: "moderate", profit: "high", leverage: "low", capex: "low",
    evidence: ["Fabless mobile/connectivity SoC leader."],
  },
  {
    key: "txn",
    legal: "Texas Instruments Incorporated",
    display: "Texas Instruments",
    ticker: "TXN",
    cik: "0000097476",
    sp500: "member",
    desc: "Analog and embedded semiconductor manufacturer with substantial internal manufacturing.",
    segments: [
      { key: "analog", name: "Analog", node: "analog_mixed_signal_and_power", w: 0.75, oi: 0.8 },
      { key: "embedded", name: "Embedded Processing", node: "analog_mixed_signal_and_power", w: 0.25, oi: 0.2 },
    ],
    customers: [["enterprise", 0.95], ["consumer", 0.05]],
    geos: [["US", "United States", 0.3], ["OTHER", "International", 0.7]],
    revenue: [["product_sales", "Semiconductor product sales", 1.0]],
    infra: [["idm_manufacturing", "IDM / Internal Fabs", 0.85], ["fabless_design", "External foundry use", 0.15]],
    semi: "analog",
    size: "mega", growth: "low", profit: "high", leverage: "low", capex: "moderate",
    evidence: ["Analog-heavy semiconductor producer with internal manufacturing."],
  },
  {
    key: "adi",
    legal: "Analog Devices, Inc.",
    display: "Analog Devices",
    ticker: "ADI",
    cik: "0000006281",
    sp500: "member",
    desc: "High-performance analog, mixed-signal, and power semiconductor company.",
    segments: [
      { key: "analog", name: "Analog / Mixed Signal", node: "analog_mixed_signal_and_power", w: 1.0, oi: 1.0 },
    ],
    customers: [["enterprise", 0.95], ["consumer", 0.05]],
    geos: [["US", "United States", 0.25], ["OTHER", "International", 0.75]],
    revenue: [["product_sales", "Semiconductor product sales", 1.0]],
    infra: [["idm_manufacturing", "Mixed manufacturing model", 1.0]],
    semi: "analog",
    size: "large", growth: "moderate", profit: "high", leverage: "moderate", capex: "moderate",
    evidence: ["Analog/mixed-signal peer to Texas Instruments."],
  },
  {
    key: "mu",
    legal: "Micron Technology, Inc.",
    display: "Micron",
    ticker: "MU",
    cik: "0000723125",
    sp500: "member",
    desc: "Memory semiconductor manufacturer focused on DRAM and NAND.",
    segments: [
      { key: "dram", name: "DRAM", node: "dram_manufacturers", w: 0.7, oi: 0.75 },
      { key: "nand", name: "NAND", node: "nand_and_other_memory", w: 0.3, oi: 0.25 },
    ],
    customers: [["enterprise", 0.7], ["consumer", 0.3]],
    geos: [["US", "United States", 0.2], ["OTHER", "International", 0.8]],
    revenue: [["product_sales", "Memory product sales", 1.0]],
    infra: [["idm_manufacturing", "Memory Manufacturing", 1.0]],
    semi: "memory",
    size: "mega", growth: "high", profit: "moderate", leverage: "moderate", capex: "high",
    evidence: ["DRAM-primary memory manufacturer with NAND exposure."],
  },
  {
    key: "amat",
    legal: "Applied Materials, Inc.",
    display: "Applied Materials",
    ticker: "AMAT",
    cik: "0000006951",
    sp500: "member",
    desc: "Semiconductor wafer fabrication equipment supplier (deposition, etch, related tools).",
    segments: [
      { key: "semiconductor_systems", name: "Semiconductor Systems", node: "etch_deposition_and_clean", w: 0.8, oi: 0.85 },
      { key: "amc", name: "Applied Global Services / other", node: "etch_deposition_and_clean", w: 0.2, oi: 0.15 },
    ],
    customers: [["enterprise", 1.0]],
    geos: [["US", "United States", 0.2], ["OTHER", "International", 0.8]],
    revenue: [["equipment_sales", "Equipment sales & services", 1.0]],
    infra: [["equipment_supplier", "Equipment Supplier", 1.0]],
    semi: "equipment",
    size: "mega", growth: "moderate", profit: "high", leverage: "low", capex: "low",
    evidence: ["WFE equipment supplier; not a chip designer."],
    competitors: ["lrcx"],
  },
  {
    key: "lrcx",
    legal: "Lam Research Corporation",
    display: "Lam Research",
    ticker: "LRCX",
    cik: "0000707549",
    sp500: "member",
    desc: "Wafer fabrication equipment company focused on etch and deposition.",
    segments: [
      { key: "systems", name: "Systems", node: "etch_deposition_and_clean", w: 0.7, oi: 0.75 },
      { key: "cs", name: "Customer Support", node: "etch_deposition_and_clean", w: 0.3, oi: 0.25 },
    ],
    customers: [["enterprise", 1.0]],
    geos: [["US", "United States", 0.15], ["OTHER", "International", 0.85]],
    revenue: [["equipment_sales", "Equipment sales & services", 1.0]],
    infra: [["equipment_supplier", "Equipment Supplier", 1.0]],
    semi: "equipment",
    size: "mega", growth: "moderate", profit: "high", leverage: "low", capex: "low",
    evidence: ["Etch/deposition WFE peer to Applied Materials."],
    competitors: ["amat"],
  },
  {
    key: "klac",
    legal: "KLA Corporation",
    display: "KLA",
    ticker: "KLAC",
    cik: "0000319201",
    sp500: "member",
    desc: "Process control and yield-management equipment for semiconductor manufacturing.",
    segments: [
      { key: "semi_process", name: "Semiconductor Process Control", node: "process_control_and_metrology", w: 0.9, oi: 0.92 },
      { key: "other", name: "Other", node: "process_control_and_metrology", w: 0.1, oi: 0.08 },
    ],
    customers: [["enterprise", 1.0]],
    geos: [["US", "United States", 0.2], ["OTHER", "International", 0.8]],
    revenue: [["equipment_sales", "Equipment sales & services", 1.0]],
    infra: [["equipment_supplier", "Equipment Supplier", 1.0]],
    semi: "equipment",
    size: "large", growth: "moderate", profit: "high", leverage: "moderate", capex: "low",
    evidence: ["Metrology/process-control WFE specialist."],
  },
  {
    key: "nxpi",
    legal: "NXP Semiconductors N.V.",
    display: "NXP Semiconductors",
    ticker: "NXPI",
    cik: "0001413447",
    sp500: "member",
    desc: "Automotive and industrial mixed-signal semiconductor company.",
    segments: [
      { key: "auto", name: "Automotive", node: "analog_mixed_signal_and_power", w: 0.55, oi: 0.55 },
      { key: "industrial_iot", name: "Industrial & IoT", node: "analog_mixed_signal_and_power", w: 0.3, oi: 0.3 },
      { key: "mobile_comm", name: "Mobile & Comm Infra", node: "analog_mixed_signal_and_power", w: 0.15, oi: 0.15 },
    ],
    customers: [["enterprise", 0.95], ["consumer", 0.05]],
    geos: [["US", "United States", 0.2], ["OTHER", "International", 0.8]],
    revenue: [["product_sales", "Semiconductor product sales", 1.0]],
    infra: [["idm_manufacturing", "Mixed manufacturing", 1.0]],
    semi: "analog",
    size: "large", growth: "moderate", profit: "moderate", leverage: "moderate", capex: "moderate",
    evidence: ["Automotive/industrial mixed-signal semiconductor producer."],
  },
  {
    key: "gfs",
    legal: "GlobalFoundries Inc.",
    display: "GlobalFoundries",
    ticker: "GFS",
    exchange: "NASDAQ",
    cik: "0001709048",
    sp500: "not_member",
    desc: "Pure-play semiconductor foundry manufacturing chips for third-party designers.",
    segments: [
      { key: "foundry", name: "Wafer manufacturing", node: "semiconductor_foundries", w: 1.0, oi: 1.0 },
    ],
    customers: [["enterprise", 1.0]],
    geos: [["US", "United States", 0.35], ["OTHER", "International", 0.65]],
    revenue: [["foundry_services", "Foundry wafer services", 1.0]],
    infra: [["foundry_capacity", "Foundry Capacity", 1.0]],
    semi: "foundry",
    size: "large", growth: "low", profit: "low", leverage: "moderate", capex: "high",
    evidence: ["Pure-play foundry; supplier to fabless designers, not a product peer."],
  },
  {
    key: "mrvl",
    legal: "Marvell Technology, Inc.",
    display: "Marvell",
    ticker: "MRVL",
    cik: "0001835632",
    sp500: "member",
    desc: "Fabless designer of data infrastructure and networking semiconductors.",
    segments: [
      { key: "data_center", name: "Data Center", node: "fabless_connectivity_and_networking", w: 0.45, oi: 0.5 },
      { key: "enterprise_networking", name: "Enterprise Networking", node: "fabless_connectivity_and_networking", w: 0.25, oi: 0.25 },
      { key: "carrier", name: "Carrier Infrastructure", node: "fabless_connectivity_and_networking", w: 0.15, oi: 0.15 },
      { key: "other", name: "Other", node: "fabless_connectivity_and_networking", w: 0.15, oi: 0.1 },
    ],
    customers: [["enterprise", 0.95], ["consumer", 0.05]],
    geos: [["US", "United States", 0.35], ["OTHER", "International", 0.65]],
    revenue: [["product_sales", "Semiconductor product sales", 1.0]],
    infra: [["fabless_design", "Fabless Design", 1.0]],
    semi: "fabless",
    size: "large", growth: "moderate", profit: "moderate", leverage: "moderate", capex: "low",
    evidence: ["Fabless networking/data infrastructure silicon."],
  },
  {
    key: "mpwr",
    legal: "Monolithic Power Systems, Inc.",
    display: "Monolithic Power Systems",
    ticker: "MPWR",
    cik: "0001280452",
    sp500: "member",
    desc: "Analog and power-management semiconductor company.",
    segments: [
      { key: "power", name: "Power management / analog", node: "analog_mixed_signal_and_power", w: 1.0, oi: 1.0 },
    ],
    customers: [["enterprise", 0.9], ["consumer", 0.1]],
    geos: [["US", "United States", 0.2], ["OTHER", "International", 0.8]],
    revenue: [["product_sales", "Semiconductor product sales", 1.0]],
    infra: [["fabless_design", "Primarily fabless/power design", 1.0]],
    semi: "analog",
    size: "large", growth: "high", profit: "high", leverage: "low", capex: "low",
    evidence: ["Analog/power semiconductor specialist."],
  },
];

// Incomplete disclosure example: slightly lower coverage for CMCSA media carve (still usable)
// Add one company with incomplete coverage for review-queue testing — use a synthetic note on CHTR other
companies.find((c) => c.key === "chtr")!.coverage = 0.95;

function write(name: string, data: unknown) {
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 2) + "\n");
}

function main() {
  mkdirSync(OUT, { recursive: true });

  const companyRows = companies.map((c) => ({
    company_key: c.key,
    legal_name: c.legal,
    display_name: c.display,
    ticker: c.ticker,
    exchange: c.exchange ?? "NASDAQ",
    cik: c.cik ?? null,
    country_of_domicile: "US",
    website: `https://example.test/${c.key}`,
    sp500_membership_status: c.sp500,
    primary_business_description: {
      value: c.desc,
      quality: "manually_classified" as Q,
      as_of: AS_OF,
    },
    industry_identifiers: { gics: c.gics ?? null, naics: null },
    is_active: true,
    data_as_of: AS_OF,
  }));

  const segments: unknown[] = [];
  const coverage: unknown[] = [];
  for (const c of companies) {
    let sum = 0;
    for (const s of c.segments) {
      sum += s.w;
      segments.push({
        company_key: c.key,
        segment_key: s.key,
        segment_name: s.name,
        node_id: s.node,
        reported_weight: s.w,
        operating_income_weight: s.oi ?? null,
        asset_weight: null,
        quality: s.q ?? "illustrative",
        fiscal_year: 2025,
        as_of: AS_OF,
      });
    }
    const cov = c.coverage ?? sum;
    coverage.push({
      company_key: c.key,
      coverage_ratio: Number(cov.toFixed(4)),
      unallocated_weight: Number(Math.max(0, 1 - cov).toFixed(4)),
      is_complete: cov >= 0.99 && cov <= 1.01,
      quality: "derived",
      as_of: AS_OF,
    });
  }

  const customers = companies.flatMap((c) =>
    c.customers.map(([customer_type, weight]) => ({
      company_key: c.key,
      customer_type,
      weight,
      quality: "illustrative" as Q,
      as_of: AS_OF,
    }))
  );

  const geos = companies.flatMap((c) =>
    c.geos.map(([geo_code, geo_name, weight]) => ({
      company_key: c.key,
      geo_code,
      geo_name,
      weight,
      quality: "illustrative" as Q,
      as_of: AS_OF,
    }))
  );

  const operating = companies.map((c) => ({
    company_key: c.key,
    revenue_models: c.revenue.map(([model_code, model_name, weight]) => ({
      model_code,
      model_name,
      weight,
      quality: "manually_classified" as Q,
    })),
    infrastructure_models: c.infra.map(([model_code, model_name, weight, notes]) => ({
      model_code,
      model_name,
      weight,
      quality: "manually_classified" as Q,
      notes: notes ?? null,
    })),
    franchise_mix: c.franchise
      ? {
          locations_franchised_pct: {
            value: c.franchise.loc,
            quality: c.franchise.q ?? "illustrative",
            as_of: AS_OF,
          },
          revenue_franchise_associated_pct: {
            value: c.franchise.rev ?? null,
            quality: c.franchise.q ?? "illustrative",
            as_of: AS_OF,
          },
          operating_income_franchise_associated_pct: {
            value: c.franchise.oi ?? null,
            quality: c.franchise.q ?? "illustrative",
            as_of: AS_OF,
          },
          systemwide_sales_franchised_pct: {
            value: c.franchise.sys ?? null,
            quality: c.franchise.q ?? "illustrative",
            as_of: AS_OF,
          },
        }
      : undefined,
    semiconductor_model: c.semi
      ? { model_code: c.semi, quality: "manually_classified" as Q }
      : undefined,
    as_of: AS_OF,
  }));

  const evidence = companies.flatMap((c, i) =>
    c.evidence.map((summary, j) => ({
      evidence_id: `ev_${c.key}_${j + 1}`,
      company_key: c.key,
      evidence_type: "curated_business_description",
      summary,
      excerpt: summary,
      locator: "pilot-fixture",
      source_document_uri: `https://example.test/filings/${c.key}`,
      related_node_id: c.segments.find((s) => s.node)?.node ?? null,
      confidence: 0.85,
      is_manual: true,
      quality: "manually_classified" as Q,
      as_of: AS_OF,
    }))
  );

  const financial = companies.map((c) => ({
    company_key: c.key,
    as_of: AS_OF,
    currency: "USD",
    size_band: { value: c.size, quality: "illustrative" as Q, note: "Banded illustrative size for pilot scoring only" },
    revenue_growth_band: { value: c.growth, quality: "illustrative" as Q },
    profitability_band: { value: c.profit, quality: "illustrative" as Q },
    leverage_band: { value: c.leverage, quality: "illustrative" as Q },
    capital_intensity_band: { value: c.capex, quality: "illustrative" as Q },
    market_cap_illustrative_usd: {
      value: null,
      quality: "illustrative" as Q,
      note: "Intentionally omitted — not live market data",
    },
    revenue_ttm_illustrative_usd: {
      value: null,
      quality: "illustrative" as Q,
      note: "Intentionally omitted — not live market data",
    },
  }));

  // One intentional override example: mark relationship reviewed for VZ-T
  const overrides = [
    {
      override_id: "ovr_vz_t_reviewed",
      company_key: "vz",
      action: "mark_relationship_reviewed",
      payload: {
        peer_company_key: "t",
        peer_type: "direct_competitor",
        status: "reviewed",
      },
      rationale: "Confirm AT&T remains a core direct wireless competitor for Verizon in the pilot.",
      reviewer: "pilot.analyst@peer-engine.test",
      effective_from: AS_OF,
      expires_on: null,
      review_by: "2027-01-31",
      quality: "manually_classified",
    },
  ];

  const exposuresMeta = {
    fixture_data_version: "1.0.0",
    as_of: AS_OF,
    note: "Primary/secondary exposures are computed by the classifier; this file stores coverage metadata and explicit competitor links.",
    segment_coverage: coverage,
    explicit_competitors: companies.flatMap((c) =>
      (c.competitors ?? []).map((comp) => ({
        company_key: c.key,
        competitor_company_key: comp,
        quality: "manually_classified" as Q,
        note: "Curated competitor link for candidate generation",
      }))
    ),
  };

  write("companies.json", {
    fixture_data_version: "1.0.0",
    as_of: AS_OF,
    quality_notice:
      "Manually curated pilot fixtures. Illustrative fields are for testing only and are not live financial data.",
    companies: companyRows,
  });
  write("business-segments.json", {
    fixture_data_version: "1.0.0",
    as_of: AS_OF,
    segments,
  });
  write("company-exposures.json", exposuresMeta);
  write("customer-exposures.json", {
    fixture_data_version: "1.0.0",
    as_of: AS_OF,
    exposures: customers,
  });
  write("geographic-exposures.json", {
    fixture_data_version: "1.0.0",
    as_of: AS_OF,
    exposures: geos,
  });
  write("operating-models.json", {
    fixture_data_version: "1.0.0",
    as_of: AS_OF,
    models: operating,
  });
  write("evidence.json", {
    fixture_data_version: "1.0.0",
    as_of: AS_OF,
    evidence,
  });
  write("financial-features.json", {
    fixture_data_version: "1.0.0",
    as_of: AS_OF,
    quality_notice: "Banded illustrative features only — not live quotes or filings extracts.",
    features: financial,
  });
  write("manual-overrides.json", {
    fixture_data_version: "1.0.0",
    as_of: AS_OF,
    overrides,
  });

  writeFileSync(
    join(ROOT, "config/pilot-universe.yaml"),
    `# Pilot company universe — Phase 2
fixture_data_version: "1.0.0"
as_of: "${AS_OF}"
taxonomy_version: "1.0.0"
company_keys:
${companies.map((c) => `  - ${c.key}`).join("\n")}
industries:
  telecommunications:
${["vz", "t", "tmus", "cmcsa", "chtr", "cci", "amt"].map((k) => `    - ${k}`).join("\n")}
  restaurants:
${["mcd", "sbux", "cmg", "yum", "dpz", "dri", "qsr", "txrh"].map((k) => `    - ${k}`).join("\n")}
  semiconductors_and_equipment:
${["nvda", "amd", "intc", "avgo", "qcom", "txn", "adi", "mu", "amat", "lrcx", "klac", "nxpi", "gfs", "mrvl", "mpwr"].map((k) => `    - ${k}`).join("\n")}
`
  );

  console.log(`Wrote ${companies.length} companies to ${OUT}`);
}

main();
