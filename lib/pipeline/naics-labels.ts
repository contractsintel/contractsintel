/**
 * NAICS 6-digit → short human label lookup.
 *
 * Used by the Instantly email personalization layer (`{{naics_label}}`) so
 * cold-outbound copy can reference a firm's primary sector naturally
 * instead of a 6-digit code.
 *
 * Coverage: top 150 codes across the 40,325 NeverBounce-valid DSBS leads
 * (all 4 cert universes). 83.9% of leads resolve a label via this table.
 * Codes not in this table return `null`, which the copy handles via
 * Instantly's `{{naics_label|"<fallback>"}}` fallback syntax.
 *
 * Label style:
 *   - 2-4 words, lowercase-readable mid-sentence
 *   - Common trade terms over Census verbose forms
 *     (e.g. "Janitorial" not "Janitorial Services")
 *   - Avoid jargon the firm wouldn't use to describe itself
 *
 * When adding labels: reference https://www.census.gov/naics/ and pick the
 * shortest unambiguous form. Double-check borderline codes with a quick
 * sample of lead company names at that NAICS.
 */

const NAICS_LABELS: Record<string, string> = {
  // --- 11 Agriculture, Forestry, Fishing, Hunting ---
  "115310": "Forestry Support",

  // --- 23 Construction ---
  "236115": "Residential Construction",
  "236118": "Residential Remodeling",
  "236210": "Industrial Building Construction",
  "236220": "Commercial Construction",
  "237110": "Water & Sewer Construction",
  "237130": "Power Line Construction",
  "237310": "Highway & Street Construction",
  "237990": "Heavy Civil Construction",
  "238110": "Concrete Contracting",
  "238140": "Masonry",
  "238160": "Roofing",
  "238210": "Electrical Contracting",
  "238220": "Plumbing & HVAC",
  "238290": "Building Equipment Installation",
  "238310": "Drywall & Insulation",
  "238320": "Painting & Wall Covering",
  "238330": "Flooring",
  "238350": "Finish Carpentry",
  "238910": "Site Preparation",
  "238990": "Specialty Trade Construction",

  // --- 31-33 Manufacturing ---
  "315210": "Cut & Sew Apparel",
  "315990": "Apparel Accessories",
  "322211": "Corrugated Boxes",
  "323111": "Commercial Printing",
  "323113": "Commercial Screen Printing",
  "332312": "Fabricated Structural Metal",
  "332710": "Machine Shops",
  "332994": "Small Arms Manufacturing",
  "332999": "Metal Manufacturing",
  "336413": "Aircraft Parts Manufacturing",
  "339112": "Surgical Instruments",
  "339113": "Medical Supplies",
  "339950": "Sign Manufacturing",
  "339999": "Other Manufacturing",

  // --- 42 Wholesale Trade ---
  "423430": "Computer Equipment Wholesale",
  "423450": "Medical Equipment Wholesale",
  "423490": "Professional Equipment Wholesale",
  "423610": "Electrical Wholesale",
  "423710": "Hardware Wholesale",
  "423840": "Industrial Supplies Wholesale",
  "423990": "Durable Goods Wholesale",
  "424120": "Stationery & Office Supplies",
  "424720": "Petroleum Wholesale",
  "425120": "Wholesale Brokers",

  // --- 45 Retail Trade ---
  "455219": "Specialty Retail",
  "458110": "Clothing Retail",
  "459999": "Other Retail",

  // --- 48-49 Transportation & Warehousing ---
  "484110": "Local Trucking",
  "484121": "Long-Distance Trucking",
  "484122": "Long-Distance Trucking",
  "484210": "Household Moving",
  "484220": "Specialized Local Trucking",
  "484230": "Specialized Long-Distance Trucking",
  "485991": "Special Needs Transportation",
  "485999": "Ground Passenger Transportation",
  "488190": "Airport Support Services",
  "488510": "Freight Forwarding",
  "492110": "Courier Services",
  "493110": "General Warehousing",

  // --- 51 Information ---
  "512110": "Video Production",
  "513210": "Software Publishers",
  "517121": "Telecommunications",
  "517810": "Telecommunications Resellers",
  "518210": "Data Processing & Hosting",

  // --- 52 Finance & Insurance ---
  "524210": "Insurance Agencies",

  // --- 53 Real Estate & Leasing ---
  "531110": "Residential Property Leasing",
  "531120": "Commercial Property Leasing",
  "531210": "Real Estate Agencies",
  "531311": "Residential Property Management",
  "531390": "Real Estate Support",

  // --- 54 Professional, Scientific & Technical Services ---
  "541110": "Law Practice",
  "541199": "Legal Services",
  "541211": "Accounting",
  "541213": "Tax Preparation",
  "541219": "Accounting Services",
  "541310": "Architecture",
  "541330": "Engineering",
  "541350": "Building Inspection",
  "541370": "Surveying & Mapping",
  "541380": "Testing Labs",
  "541410": "Interior Design",
  "541430": "Graphic Design",
  "541511": "Custom Software",
  "541512": "IT Systems Design",
  "541513": "IT Infrastructure Management",
  "541519": "IT Services",
  "541611": "Management Consulting",
  "541612": "HR Consulting",
  "541613": "Marketing Consulting",
  "541614": "Logistics Consulting",
  "541618": "Other Management Consulting",
  "541620": "Environmental Consulting",
  "541690": "Scientific & Technical Consulting",
  "541715": "R&D Services",
  "541720": "Social Sciences R&D",
  "541810": "Advertising Agencies",
  "541820": "Public Relations",
  "541890": "Other Services to Advertising",
  "541922": "Commercial Photography",
  "541930": "Translation Services",
  "541990": "Professional Services",

  // --- 56 Administrative & Support Services ---
  "561110": "Office Administration",
  "561210": "Facilities Support Services",
  "561311": "Employment Placement",
  "561320": "Temporary Staffing",
  "561410": "Document Preparation",
  "561499": "Business Support Services",
  "561510": "Travel Agencies",
  "561611": "Investigation Services",
  "561612": "Security Guard Services",
  "561621": "Security Systems",
  "561710": "Pest Control",
  "561720": "Janitorial",
  "561730": "Landscaping",
  "561790": "Building Services",
  "561920": "Convention & Trade Show Services",
  "561990": "Support Services",
  "562111": "Solid Waste Collection",
  "562119": "Waste Collection",
  "562910": "Remediation Services",
  "562991": "Septic Pumping",

  // --- 61 Educational Services ---
  "611420": "Computer Training",
  "611430": "Professional Training",
  "611519": "Technical Training",
  "611620": "Sports & Recreation Instruction",
  "611699": "Other Instruction",
  "611710": "Educational Support Services",

  // --- 62 Health Care & Social Assistance ---
  "621111": "Medical Practice",
  "621330": "Mental Health Practice",
  "621340": "Physical Therapy",
  "621399": "Health Practitioners",
  "621420": "Outpatient Mental Health",
  "621511": "Medical Labs",
  "621610": "Home Health Care",
  "621999": "Ambulatory Health Services",
  "624120": "Services for Elderly & Disabled",
  "624190": "Community Support Services",
  "624230": "Emergency & Relief Services",

  // --- 71 Arts, Entertainment & Recreation ---
  "711510": "Independent Artists & Writers",

  // --- 72 Accommodation & Food Services ---
  "721110": "Hotels",
  "722310": "Food Service Contractors",
  "722320": "Catering",

  // --- 81 Other Services ---
  "811111": "Auto Repair",
  "811210": "Electronics Repair",
  "811310": "Industrial Machinery Repair",
  "812112": "Beauty Salons",
  "812199": "Personal Care Services",
  "812990": "Personal Services",
  "813920": "Professional Organizations",
};

/**
 * Look up a NAICS 6-digit code and return a short human label, or null if
 * the code isn't in the table. Returning null lets the Instantly fallback
 * syntax handle the "no label" case gracefully.
 *
 * Accepts loosely-typed input (string | number | null | undefined) because
 * the leads table stores NAICS as text but upstream JSON can hand us a
 * number on occasion.
 */
export function naicsLabel(code: string | number | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  const key = String(code).trim();
  if (!key) return null;
  return NAICS_LABELS[key] ?? null;
}

/** Exposed for tests and diagnostics. */
export const NAICS_LABEL_TABLE: Readonly<Record<string, string>> = NAICS_LABELS;
