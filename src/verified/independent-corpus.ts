/**
 * Independent verified offline corpus for Phase 3.5.
 *
 * IMPORTANT: This module must NOT import Phase-2 curated segment/operating
 * fixture JSON. Values are independently authored disclosure excerpts and
 * approximate public FY figures for offline verification testing.
 *
 * provenance_class: independent_offline_verified_excerpt
 * These are still offline stand-ins for EDGAR, but they break circularity
 * with Phase-2 curated pilot JSON.
 */
export const VERIFIED_CORPUS_VERSION = "1.0.0";
export const PROVENANCE_CLASS = "independent_offline_verified_excerpt" as const;

export interface VerifiedCompanyCorpus {
  company_key: string;
  ticker: string;
  cik: string;
  registrant: string;
  exchange: string;
  foreign_issuer?: boolean;
  /** Independently authored business excerpt (not copied from Phase-2 JSON). */
  business_excerpt: string;
  competition_excerpt: string;
  segment_lines: Array<{ name: string; revenue_pct: number }>;
  franchise_locations_pct?: number;
  semiconductor_model?: "fabless" | "idm" | "foundry" | "memory" | "analog" | "equipment";
  infrastructure_model?: string;
  /** Approximate USD facts for two fiscal years — independently set. */
  facts: {
    revenue_fy2023: number;
    revenue_fy2024: number;
    operating_income_fy2024: number;
    assets_fy2024: number;
    long_term_debt_fy2024: number;
    rd_fy2024: number;
    capex_fy2024: number;
  };
}

export const VERIFIED_CORPUS: VerifiedCompanyCorpus[] = [
  {
    company_key: "vz",
    ticker: "VZ",
    cik: "0000732712",
    registrant: "Verizon Communications Inc.",
    exchange: "NYSE",
    business_excerpt:
      "Verizon operates a nationwide wireless network and provides consumer and business connectivity services. Wireless service is the principal driver of consolidated results, with additional wireline and business solutions.",
    competition_excerpt:
      "We compete with AT&T and T-Mobile in U.S. wireless services and with cable operators such as Comcast and Charter for broadband connectivity.",
    segment_lines: [
      { name: "Wireless", revenue_pct: 0.77 },
      { name: "Business / Wireline", revenue_pct: 0.23 },
    ],
    infrastructure_model: "network_owner",
    facts: {
      revenue_fy2023: 134000000000,
      revenue_fy2024: 134800000000,
      operating_income_fy2024: 28800000000,
      assets_fy2024: 380000000000,
      long_term_debt_fy2024: 135000000000,
      rd_fy2024: 0,
      capex_fy2024: 17000000000,
    },
  },
  {
    company_key: "t",
    ticker: "T",
    cik: "0000732717",
    registrant: "AT&T Inc.",
    exchange: "NYSE",
    business_excerpt:
      "AT&T provides communications and technology services, including wireless mobility and wireline broadband/fiber services to consumers and businesses in the United States.",
    competition_excerpt:
      "Primary wireless competitors include Verizon and T-Mobile. Wireline broadband competes with cable and fiber providers.",
    segment_lines: [
      { name: "Mobility", revenue_pct: 0.64 },
      { name: "Business Wireline", revenue_pct: 0.26 },
      { name: "Consumer Wireline", revenue_pct: 0.1 },
    ],
    infrastructure_model: "network_owner",
    facts: {
      revenue_fy2023: 122400000000,
      revenue_fy2024: 122300000000,
      operating_income_fy2024: 22000000000,
      assets_fy2024: 400000000000,
      long_term_debt_fy2024: 125000000000,
      rd_fy2024: 0,
      capex_fy2024: 20000000000,
    },
  },
  {
    company_key: "tmus",
    ticker: "TMUS",
    cik: "0001283699",
    registrant: "T-Mobile US, Inc.",
    exchange: "NASDAQ",
    business_excerpt:
      "T-Mobile US operates a nationwide wireless communications network focused primarily on postpaid and prepaid mobile services.",
    competition_excerpt:
      "We compete principally with Verizon and AT&T for U.S. wireless customers.",
    segment_lines: [{ name: "Wireless", revenue_pct: 1.0 }],
    infrastructure_model: "network_owner",
    facts: {
      revenue_fy2023: 78500000000,
      revenue_fy2024: 81400000000,
      operating_income_fy2024: 16000000000,
      assets_fy2024: 210000000000,
      long_term_debt_fy2024: 75000000000,
      rd_fy2024: 0,
      capex_fy2024: 10000000000,
    },
  },
  {
    company_key: "cmcsa",
    ticker: "CMCSA",
    cik: "0001166691",
    registrant: "Comcast Corporation",
    exchange: "NASDAQ",
    business_excerpt:
      "Comcast operates cable communications (broadband, video, voice) and media businesses. Connectivity through the cable platform is a core economic engine.",
    competition_excerpt:
      "Broadband competes with telephone companies and fixed wireless. Media competes with other content platforms.",
    segment_lines: [
      { name: "Connectivity & Platforms", revenue_pct: 0.58 },
      { name: "Content & Experiences", revenue_pct: 0.42 },
    ],
    infrastructure_model: "network_owner",
    facts: {
      revenue_fy2023: 121600000000,
      revenue_fy2024: 123700000000,
      operating_income_fy2024: 23000000000,
      assets_fy2024: 265000000000,
      long_term_debt_fy2024: 95000000000,
      rd_fy2024: 0,
      capex_fy2024: 12000000000,
    },
  },
  {
    company_key: "chtr",
    ticker: "CHTR",
    cik: "0001091667",
    registrant: "Charter Communications, Inc.",
    exchange: "NASDAQ",
    business_excerpt:
      "Charter provides broadband, video, and voice services under the Spectrum brand over a hybrid fiber-coax network, primarily to residential and SMB customers.",
    competition_excerpt:
      "We compete with telephone companies, fiber overbuilders, and fixed wireless broadband providers.",
    segment_lines: [
      { name: "Internet", revenue_pct: 0.57 },
      { name: "Video / Voice / Mobile", revenue_pct: 0.43 },
    ],
    infrastructure_model: "network_owner",
    facts: {
      revenue_fy2023: 54600000000,
      revenue_fy2024: 55100000000,
      operating_income_fy2024: 12500000000,
      assets_fy2024: 148000000000,
      long_term_debt_fy2024: 96000000000,
      rd_fy2024: 0,
      capex_fy2024: 11000000000,
    },
  },
  {
    company_key: "cci",
    ticker: "CCI",
    cik: "0001051470",
    registrant: "Crown Castle Inc.",
    exchange: "NYSE",
    business_excerpt:
      "Crown Castle owns and leases shared communications infrastructure, including towers and fiber, primarily to wireless carriers. We are not a retail wireless network operator.",
    competition_excerpt:
      "We compete with other tower and infrastructure owners such as American Tower for carrier tenancy.",
    segment_lines: [
      { name: "Towers", revenue_pct: 0.68 },
      { name: "Fiber", revenue_pct: 0.32 },
    ],
    infrastructure_model: "infra_landlord",
    facts: {
      revenue_fy2023: 6980000000,
      revenue_fy2024: 6600000000,
      operating_income_fy2024: 1800000000,
      assets_fy2024: 39000000000,
      long_term_debt_fy2024: 22000000000,
      rd_fy2024: 0,
      capex_fy2024: 1500000000,
    },
  },
  {
    company_key: "amt",
    ticker: "AMT",
    cik: "0001053507",
    registrant: "American Tower Corporation",
    exchange: "NYSE",
    business_excerpt:
      "American Tower owns and operates wireless and broadcast communications sites and leases space on towers to wireless service providers globally.",
    competition_excerpt:
      "Competitors include other communications infrastructure companies such as Crown Castle in the United States.",
    segment_lines: [{ name: "Communications Sites", revenue_pct: 1.0 }],
    infrastructure_model: "infra_landlord",
    facts: {
      revenue_fy2023: 11100000000,
      revenue_fy2024: 11300000000,
      operating_income_fy2024: 4200000000,
      assets_fy2024: 66000000000,
      long_term_debt_fy2024: 38000000000,
      rd_fy2024: 0,
      capex_fy2024: 1800000000,
    },
  },
  {
    company_key: "mcd",
    ticker: "MCD",
    cik: "0000063908",
    registrant: "McDonald's Corporation",
    exchange: "NYSE",
    business_excerpt:
      "McDonald's franchises and operates McDonald's restaurants. The substantial majority of restaurants globally are franchised; franchise royalties and fees are material to operating income.",
    competition_excerpt:
      "We compete with other global QSR brands including concepts owned by Yum! Brands and Restaurant Brands International, as well as pizza and coffee chains.",
    segment_lines: [
      { name: "Franchised restaurants", revenue_pct: 0.58 },
      { name: "Company-operated restaurants", revenue_pct: 0.42 },
    ],
    franchise_locations_pct: 0.95,
    facts: {
      revenue_fy2023: 25500000000,
      revenue_fy2024: 25900000000,
      operating_income_fy2024: 11700000000,
      assets_fy2024: 55000000000,
      long_term_debt_fy2024: 38000000000,
      rd_fy2024: 0,
      capex_fy2024: 2400000000,
    },
  },
  {
    company_key: "sbux",
    ticker: "SBUX",
    cik: "0000829224",
    registrant: "Starbucks Corporation",
    exchange: "NASDAQ",
    business_excerpt:
      "Starbucks operates and licenses Starbucks coffeehouses. Company-operated stores are the primary model in the United States, with licensed stores more common in some international markets.",
    competition_excerpt:
      "We compete with specialty coffee retailers, QSR chains, and convenience beverage outlets.",
    segment_lines: [
      { name: "North America", revenue_pct: 0.72 },
      { name: "International", revenue_pct: 0.23 },
      { name: "Channel Development", revenue_pct: 0.05 },
    ],
    franchise_locations_pct: 0.48,
    facts: {
      revenue_fy2023: 36000000000,
      revenue_fy2024: 36300000000,
      operating_income_fy2024: 5400000000,
      assets_fy2024: 30000000000,
      long_term_debt_fy2024: 15000000000,
      rd_fy2024: 0,
      capex_fy2024: 2800000000,
    },
  },
  {
    company_key: "cmg",
    ticker: "CMG",
    cik: "0001058090",
    registrant: "Chipotle Mexican Grill, Inc.",
    exchange: "NYSE",
    business_excerpt:
      "Chipotle owns and operates fast-casual restaurants. Restaurants are substantially all company-operated.",
    competition_excerpt:
      "We compete with other fast-casual and limited-service restaurant brands.",
    segment_lines: [{ name: "Restaurant sales", revenue_pct: 1.0 }],
    franchise_locations_pct: 0.0,
    facts: {
      revenue_fy2023: 9900000000,
      revenue_fy2024: 11300000000,
      operating_income_fy2024: 1900000000,
      assets_fy2024: 9200000000,
      long_term_debt_fy2024: 0,
      rd_fy2024: 0,
      capex_fy2024: 600000000,
    },
  },
  {
    company_key: "yum",
    ticker: "YUM",
    cik: "0001041061",
    registrant: "Yum! Brands, Inc.",
    exchange: "NYSE",
    business_excerpt:
      "Yum! Brands is an asset-light franchisor of KFC, Taco Bell, and Pizza Hut. Nearly all system restaurants are franchised.",
    competition_excerpt:
      "Brand concepts compete with other QSR operators including McDonald's and Restaurant Brands International brands.",
    segment_lines: [
      { name: "Franchise and property revenues", revenue_pct: 0.88 },
      { name: "Company sales", revenue_pct: 0.12 },
    ],
    franchise_locations_pct: 0.98,
    facts: {
      revenue_fy2023: 7100000000,
      revenue_fy2024: 7500000000,
      operating_income_fy2024: 2400000000,
      assets_fy2024: 6500000000,
      long_term_debt_fy2024: 11000000000,
      rd_fy2024: 0,
      capex_fy2024: 300000000,
    },
  },
  {
    company_key: "dpz",
    ticker: "DPZ",
    cik: "0001286681",
    registrant: "Domino's Pizza, Inc.",
    exchange: "NYSE",
    business_excerpt:
      "Domino's franchises and operates pizza delivery and carryout restaurants. The system is heavily franchised and includes supply-chain operations supporting franchisees.",
    competition_excerpt:
      "We compete with other pizza QSR brands and delivery-oriented restaurants.",
    segment_lines: [
      { name: "U.S. stores", revenue_pct: 0.52 },
      { name: "International franchise", revenue_pct: 0.3 },
      { name: "Supply chain", revenue_pct: 0.18 },
    ],
    franchise_locations_pct: 0.98,
    facts: {
      revenue_fy2023: 4500000000,
      revenue_fy2024: 4700000000,
      operating_income_fy2024: 900000000,
      assets_fy2024: 1800000000,
      long_term_debt_fy2024: 5000000000,
      rd_fy2024: 0,
      capex_fy2024: 120000000,
    },
  },
  {
    company_key: "dri",
    ticker: "DRI",
    cik: "0000940944",
    registrant: "Darden Restaurants, Inc.",
    exchange: "NYSE",
    business_excerpt:
      "Darden owns and operates full-service restaurants including Olive Garden and other casual dining brands. Restaurants are primarily company-operated.",
    competition_excerpt:
      "We compete with other casual dining restaurant companies.",
    segment_lines: [
      { name: "Olive Garden", revenue_pct: 0.54 },
      { name: "Other brands", revenue_pct: 0.46 },
    ],
    franchise_locations_pct: 0.0,
    facts: {
      revenue_fy2023: 10500000000,
      revenue_fy2024: 11400000000,
      operating_income_fy2024: 1300000000,
      assets_fy2024: 11300000000,
      long_term_debt_fy2024: 1500000000,
      rd_fy2024: 0,
      capex_fy2024: 650000000,
    },
  },
  {
    company_key: "qsr",
    ticker: "QSR",
    cik: "0001618756",
    registrant: "Restaurant Brands International Inc.",
    exchange: "NYSE",
    business_excerpt:
      "Restaurant Brands International is an asset-light franchisor of Burger King, Tim Hortons, and Popeyes. System restaurants are predominantly franchised.",
    competition_excerpt:
      "Our brands compete with McDonald's, Yum! Brands concepts, and other QSR operators.",
    segment_lines: [{ name: "Franchise revenues", revenue_pct: 1.0 }],
    franchise_locations_pct: 0.94,
    facts: {
      revenue_fy2023: 7000000000,
      revenue_fy2024: 8400000000,
      operating_income_fy2024: 2200000000,
      assets_fy2024: 24000000000,
      long_term_debt_fy2024: 13000000000,
      rd_fy2024: 0,
      capex_fy2024: 150000000,
    },
  },
  {
    company_key: "txrh",
    ticker: "TXRH",
    cik: "0001289460",
    registrant: "Texas Roadhouse, Inc.",
    exchange: "NASDAQ",
    business_excerpt:
      "Texas Roadhouse operates casual dining restaurants that are primarily company-owned, with a smaller franchised mix.",
    competition_excerpt:
      "We compete with other casual dining steakhouse and full-service restaurants.",
    segment_lines: [
      { name: "Company restaurants", revenue_pct: 0.92 },
      { name: "Franchise", revenue_pct: 0.08 },
    ],
    franchise_locations_pct: 0.12,
    facts: {
      revenue_fy2023: 4600000000,
      revenue_fy2024: 5400000000,
      operating_income_fy2024: 450000000,
      assets_fy2024: 2800000000,
      long_term_debt_fy2024: 0,
      rd_fy2024: 0,
      capex_fy2024: 300000000,
    },
  },
  {
    company_key: "nvda",
    ticker: "NVDA",
    cik: "0001045810",
    registrant: "NVIDIA Corporation",
    exchange: "NASDAQ",
    business_excerpt:
      "NVIDIA designs GPUs and accelerated computing platforms. We are a fabless semiconductor company; wafer manufacturing is performed by foundry partners.",
    competition_excerpt:
      "We compete with AMD and other accelerated computing suppliers. We do not compete with wafer-fab equipment companies as product peers.",
    segment_lines: [
      { name: "Compute & Networking", revenue_pct: 0.82 },
      { name: "Graphics", revenue_pct: 0.18 },
    ],
    semiconductor_model: "fabless",
    facts: {
      revenue_fy2023: 27000000000,
      revenue_fy2024: 60900000000,
      operating_income_fy2024: 33000000000,
      assets_fy2024: 66000000000,
      long_term_debt_fy2024: 8500000000,
      rd_fy2024: 8700000000,
      capex_fy2024: 1100000000,
    },
  },
  {
    company_key: "amd",
    ticker: "AMD",
    cik: "0000002488",
    registrant: "Advanced Micro Devices, Inc.",
    exchange: "NASDAQ",
    business_excerpt:
      "AMD designs high-performance CPUs, GPUs, and adaptive computing products as a fabless semiconductor company using external foundries.",
    competition_excerpt:
      "We compete with NVIDIA in GPUs/accelerators and with Intel in CPUs and related processors.",
    segment_lines: [
      { name: "Data Center", revenue_pct: 0.46 },
      { name: "Client", revenue_pct: 0.28 },
      { name: "Gaming", revenue_pct: 0.16 },
      { name: "Embedded", revenue_pct: 0.1 },
    ],
    semiconductor_model: "fabless",
    facts: {
      revenue_fy2023: 22800000000,
      revenue_fy2024: 25800000000,
      operating_income_fy2024: 2000000000,
      assets_fy2024: 69000000000,
      long_term_debt_fy2024: 1700000000,
      rd_fy2024: 6000000000,
      capex_fy2024: 600000000,
    },
  },
  {
    company_key: "intc",
    ticker: "INTC",
    cik: "0000050863",
    registrant: "Intel Corporation",
    exchange: "NASDAQ",
    business_excerpt:
      "Intel designs and manufactures semiconductors using an integrated device manufacturing model, including client and data-center processors, and is developing foundry services for external customers.",
    competition_excerpt:
      "We compete with AMD in CPUs and with other semiconductor companies across product lines. Foundry services compete with dedicated foundries.",
    segment_lines: [
      { name: "Client Computing", revenue_pct: 0.42 },
      { name: "Data Center & AI", revenue_pct: 0.28 },
      { name: "Intel Foundry", revenue_pct: 0.15 },
      { name: "Other", revenue_pct: 0.15 },
    ],
    semiconductor_model: "idm",
    facts: {
      revenue_fy2023: 54200000000,
      revenue_fy2024: 53200000000,
      operating_income_fy2024: -2000000000,
      assets_fy2024: 192000000000,
      long_term_debt_fy2024: 50000000000,
      rd_fy2024: 16500000000,
      capex_fy2024: 25000000000,
    },
  },
  {
    company_key: "avgo",
    ticker: "AVGO",
    cik: "0001730168",
    registrant: "Broadcom Inc.",
    exchange: "NASDAQ",
    business_excerpt:
      "Broadcom provides semiconductor solutions for networking and infrastructure and also sells infrastructure software. Semiconductor design is primarily fabless.",
    competition_excerpt:
      "Semiconductor competitors include other networking and infrastructure chip vendors.",
    segment_lines: [
      { name: "Semiconductor solutions", revenue_pct: 0.78 },
      { name: "Infrastructure software", revenue_pct: 0.22 },
    ],
    semiconductor_model: "fabless",
    facts: {
      revenue_fy2023: 35800000000,
      revenue_fy2024: 51600000000,
      operating_income_fy2024: 15000000000,
      assets_fy2024: 165000000000,
      long_term_debt_fy2024: 70000000000,
      rd_fy2024: 9000000000,
      capex_fy2024: 500000000,
    },
  },
  {
    company_key: "qcom",
    ticker: "QCOM",
    cik: "0000804328",
    registrant: "QUALCOMM Incorporated",
    exchange: "NASDAQ",
    business_excerpt:
      "Qualcomm develops and licenses wireless technology and sells fabless mobile and connectivity semiconductor products (QCT) and licensing (QTL).",
    competition_excerpt:
      "Chip competitors include other mobile and connectivity semiconductor companies.",
    segment_lines: [
      { name: "QCT", revenue_pct: 0.82 },
      { name: "QTL", revenue_pct: 0.18 },
    ],
    semiconductor_model: "fabless",
    facts: {
      revenue_fy2023: 35800000000,
      revenue_fy2024: 38900000000,
      operating_income_fy2024: 10000000000,
      assets_fy2024: 52000000000,
      long_term_debt_fy2024: 14000000000,
      rd_fy2024: 8500000000,
      capex_fy2024: 1000000000,
    },
  },
  {
    company_key: "txn",
    ticker: "TXN",
    cik: "0000097476",
    registrant: "Texas Instruments Incorporated",
    exchange: "NASDAQ",
    business_excerpt:
      "Texas Instruments designs and manufactures analog and embedded processing semiconductors, with substantial internal manufacturing capacity.",
    competition_excerpt:
      "We compete with other analog and embedded semiconductor suppliers such as Analog Devices.",
    segment_lines: [
      { name: "Analog", revenue_pct: 0.76 },
      { name: "Embedded Processing", revenue_pct: 0.24 },
    ],
    semiconductor_model: "analog",
    facts: {
      revenue_fy2023: 17500000000,
      revenue_fy2024: 15600000000,
      operating_income_fy2024: 5800000000,
      assets_fy2024: 35000000000,
      long_term_debt_fy2024: 12000000000,
      rd_fy2024: 1900000000,
      capex_fy2024: 4500000000,
    },
  },
  {
    company_key: "adi",
    ticker: "ADI",
    cik: "0000006281",
    registrant: "Analog Devices, Inc.",
    exchange: "NASDAQ",
    business_excerpt:
      "Analog Devices designs and manufactures high-performance analog, mixed-signal, and digital signal processing products.",
    competition_excerpt:
      "Competitors include Texas Instruments and other analog/mixed-signal semiconductor companies.",
    segment_lines: [{ name: "Analog / Mixed Signal", revenue_pct: 1.0 }],
    semiconductor_model: "analog",
    facts: {
      revenue_fy2023: 12300000000,
      revenue_fy2024: 9400000000,
      operating_income_fy2024: 2500000000,
      assets_fy2024: 48000000000,
      long_term_debt_fy2024: 7000000000,
      rd_fy2024: 1600000000,
      capex_fy2024: 800000000,
    },
  },
  {
    company_key: "mu",
    ticker: "MU",
    cik: "0000723125",
    registrant: "Micron Technology, Inc.",
    exchange: "NASDAQ",
    business_excerpt:
      "Micron designs and manufactures memory and storage products, principally DRAM and NAND.",
    competition_excerpt:
      "We compete with other memory semiconductor manufacturers.",
    segment_lines: [
      { name: "DRAM", revenue_pct: 0.72 },
      { name: "NAND", revenue_pct: 0.28 },
    ],
    semiconductor_model: "memory",
    facts: {
      revenue_fy2023: 15500000000,
      revenue_fy2024: 25100000000,
      operating_income_fy2024: 1500000000,
      assets_fy2024: 69000000000,
      long_term_debt_fy2024: 13000000000,
      rd_fy2024: 3400000000,
      capex_fy2024: 8000000000,
    },
  },
  {
    company_key: "amat",
    ticker: "AMAT",
    cik: "0000006951",
    registrant: "Applied Materials, Inc.",
    exchange: "NASDAQ",
    business_excerpt:
      "Applied Materials supplies manufacturing equipment and services used to produce semiconductor chips, including deposition and related wafer-fab tools.",
    competition_excerpt:
      "We compete with other semiconductor equipment companies such as Lam Research and process-control suppliers.",
    segment_lines: [
      { name: "Semiconductor Systems", revenue_pct: 0.78 },
      { name: "Applied Global Services", revenue_pct: 0.22 },
    ],
    semiconductor_model: "equipment",
    facts: {
      revenue_fy2023: 26500000000,
      revenue_fy2024: 27200000000,
      operating_income_fy2024: 7600000000,
      assets_fy2024: 32000000000,
      long_term_debt_fy2024: 5500000000,
      rd_fy2024: 3100000000,
      capex_fy2024: 1100000000,
    },
  },
  {
    company_key: "lrcx",
    ticker: "LRCX",
    cik: "0000707549",
    registrant: "Lam Research Corporation",
    exchange: "NASDAQ",
    business_excerpt:
      "Lam Research designs and manufactures wafer fabrication equipment focused on etch and deposition processes for semiconductor manufacturing.",
    competition_excerpt:
      "Competitors include Applied Materials and other wafer-fab equipment suppliers.",
    segment_lines: [
      { name: "Systems", revenue_pct: 0.68 },
      { name: "Customer Support", revenue_pct: 0.32 },
    ],
    semiconductor_model: "equipment",
    facts: {
      revenue_fy2023: 17400000000,
      revenue_fy2024: 14900000000,
      operating_income_fy2024: 4000000000,
      assets_fy2024: 19000000000,
      long_term_debt_fy2024: 5000000000,
      rd_fy2024: 1900000000,
      capex_fy2024: 500000000,
    },
  },
  {
    company_key: "klac",
    ticker: "KLAC",
    cik: "0000319201",
    registrant: "KLA Corporation",
    exchange: "NASDAQ",
    business_excerpt:
      "KLA supplies process control and yield-management systems used in semiconductor manufacturing.",
    competition_excerpt:
      "We compete with other process-control and metrology equipment providers.",
    segment_lines: [{ name: "Semiconductor Process Control", revenue_pct: 1.0 }],
    semiconductor_model: "equipment",
    facts: {
      revenue_fy2023: 10500000000,
      revenue_fy2024: 9800000000,
      operating_income_fy2024: 3700000000,
      assets_fy2024: 15000000000,
      long_term_debt_fy2024: 6000000000,
      rd_fy2024: 1300000000,
      capex_fy2024: 300000000,
    },
  },
  {
    company_key: "nxpi",
    ticker: "NXPI",
    cik: "0001413447",
    registrant: "NXP Semiconductors N.V.",
    exchange: "NASDAQ",
    foreign_issuer: true,
    business_excerpt:
      "NXP provides mixed-signal and automotive semiconductor solutions. Manufacturing uses a mix of internal and external capacity.",
    competition_excerpt:
      "Competitors include other automotive and mixed-signal semiconductor suppliers.",
    segment_lines: [
      { name: "Automotive", revenue_pct: 0.56 },
      { name: "Industrial & IoT", revenue_pct: 0.28 },
      { name: "Mobile & Comm", revenue_pct: 0.16 },
    ],
    semiconductor_model: "analog",
    facts: {
      revenue_fy2023: 13300000000,
      revenue_fy2024: 12600000000,
      operating_income_fy2024: 3500000000,
      assets_fy2024: 24000000000,
      long_term_debt_fy2024: 10000000000,
      rd_fy2024: 2400000000,
      capex_fy2024: 900000000,
    },
  },
  {
    company_key: "gfs",
    ticker: "GFS",
    cik: "0001709048",
    registrant: "GlobalFoundries Inc.",
    exchange: "NASDAQ",
    foreign_issuer: true,
    business_excerpt:
      "GlobalFoundries is a pure-play semiconductor foundry manufacturing wafers for third-party fabless and IDM customers.",
    competition_excerpt:
      "We compete with other pure-play and captive foundries for wafer manufacturing services.",
    segment_lines: [{ name: "Wafer manufacturing", revenue_pct: 1.0 }],
    semiconductor_model: "foundry",
    facts: {
      revenue_fy2023: 7400000000,
      revenue_fy2024: 6700000000,
      operating_income_fy2024: -200000000,
      assets_fy2024: 18000000000,
      long_term_debt_fy2024: 2500000000,
      rd_fy2024: 400000000,
      capex_fy2024: 3000000000,
    },
  },
  {
    company_key: "mrvl",
    ticker: "MRVL",
    cik: "0001835632",
    registrant: "Marvell Technology, Inc.",
    exchange: "NASDAQ",
    business_excerpt:
      "Marvell designs data infrastructure semiconductor products, including networking and storage solutions, on a fabless basis.",
    competition_excerpt:
      "Competitors include other networking and infrastructure semiconductor vendors.",
    segment_lines: [
      { name: "Data Center", revenue_pct: 0.48 },
      { name: "Enterprise Networking", revenue_pct: 0.24 },
      { name: "Carrier", revenue_pct: 0.14 },
      { name: "Other", revenue_pct: 0.14 },
    ],
    semiconductor_model: "fabless",
    facts: {
      revenue_fy2023: 5500000000,
      revenue_fy2024: 5700000000,
      operating_income_fy2024: -500000000,
      assets_fy2024: 21000000000,
      long_term_debt_fy2024: 4000000000,
      rd_fy2024: 1900000000,
      capex_fy2024: 300000000,
    },
  },
  {
    company_key: "mpwr",
    ticker: "MPWR",
    cik: "0001280452",
    registrant: "Monolithic Power Systems, Inc.",
    exchange: "NASDAQ",
    business_excerpt:
      "Monolithic Power Systems designs power-management and analog semiconductor solutions, primarily using a fabless manufacturing model.",
    competition_excerpt:
      "We compete with other analog and power-management semiconductor companies.",
    segment_lines: [{ name: "Power / Analog", revenue_pct: 1.0 }],
    semiconductor_model: "analog",
    facts: {
      revenue_fy2023: 1800000000,
      revenue_fy2024: 2200000000,
      operating_income_fy2024: 500000000,
      assets_fy2024: 2800000000,
      long_term_debt_fy2024: 0,
      rd_fy2024: 300000000,
      capex_fy2024: 100000000,
    },
  },
];
