"use client";

import { useState, useRef, useEffect } from "react";

const FEDERAL_AGENCIES = [
  "Department of Defense (DoD)",
  "Department of the Army",
  "Department of the Navy",
  "Department of the Air Force",
  "U.S. Marine Corps",
  "U.S. Space Force",
  "Department of Homeland Security (DHS)",
  "Department of Veterans Affairs (VA)",
  "Department of Health and Human Services (HHS)",
  "General Services Administration (GSA)",
  "Department of Energy (DOE)",
  "Department of Transportation (DOT)",
  "Environmental Protection Agency (EPA)",
  "National Aeronautics and Space Administration (NASA)",
  "Department of Agriculture (USDA)",
  "Department of Justice (DOJ)",
  "Department of the Interior (DOI)",
  "Department of Labor (DOL)",
  "Department of Commerce",
  "Department of the Treasury",
  "Department of State",
  "Department of Education",
  "Department of Housing and Urban Development (HUD)",
  "Small Business Administration (SBA)",
  "U.S. Agency for International Development (USAID)",
  "Social Security Administration (SSA)",
  "Office of Personnel Management (OPM)",
  "Federal Emergency Management Agency (FEMA)",
  "Customs and Border Protection (CBP)",
  "Immigration and Customs Enforcement (ICE)",
  "U.S. Coast Guard (USCG)",
  "Federal Bureau of Investigation (FBI)",
  "Drug Enforcement Administration (DEA)",
  "Bureau of Alcohol, Tobacco, Firearms and Explosives (ATF)",
  "Defense Information Systems Agency (DISA)",
  "Defense Advanced Research Projects Agency (DARPA)",
  "National Geospatial-Intelligence Agency (NGA)",
  "National Security Agency (NSA)",
  "Central Intelligence Agency (CIA)",
  "Defense Intelligence Agency (DIA)",
  "Defense Counterintelligence and Security Agency (DCSA)",
  "U.S. Special Operations Command (SOCOM)",
  "U.S. Army Corps of Engineers (USACE)",
  "Missile Defense Agency (MDA)",
  "Defense Health Agency (DHA)",
  "Nuclear Regulatory Commission (NRC)",
  "Federal Aviation Administration (FAA)",
  "National Oceanic and Atmospheric Administration (NOAA)",
  "U.S. Census Bureau",
  "Internal Revenue Service (IRS)",
  "U.S. Citizenship and Immigration Services (USCIS)",
  "Centers for Disease Control and Prevention (CDC)",
  "Centers for Medicare & Medicaid Services (CMS)",
  "National Institutes of Health (NIH)",
  "Food and Drug Administration (FDA)",
  "U.S. Postal Service (USPS)",
  "Securities and Exchange Commission (SEC)",
  "Federal Communications Commission (FCC)",
  "Consumer Financial Protection Bureau (CFPB)",
  "National Science Foundation (NSF)",
  "Smithsonian Institution",
  "U.S. Patent and Trademark Office (USPTO)",
  "Bureau of Prisons (BOP)",
  "U.S. Marshals Service",
  "Bureau of Land Management (BLM)",
  "National Park Service (NPS)",
  "U.S. Fish and Wildlife Service (FWS)",
  "Forest Service (USFS)",
  "Federal Highway Administration (FHWA)",
  "Maritime Administration (MARAD)",
  "Defense Logistics Agency (DLA)",
];

const COMMON_NAICS = [
  { code: "111110", desc: "Soybean Farming" },
  { code: "236220", desc: "Commercial Building Construction" },
  { code: "237310", desc: "Highway, Street, and Bridge Construction" },
  { code: "238220", desc: "Plumbing, Heating, and AC Contractors" },
  { code: "334111", desc: "Electronic Computer Manufacturing" },
  { code: "334118", desc: "Computer Terminal and Peripheral Equipment" },
  { code: "334511", desc: "Search, Detection, Navigation Instruments" },
  { code: "335911", desc: "Storage Battery Manufacturing" },
  { code: "336411", desc: "Aircraft Manufacturing" },
  { code: "336413", desc: "Other Aircraft Parts Manufacturing" },
  { code: "423430", desc: "Computer Equipment Merchant Wholesalers" },
  { code: "511210", desc: "Software Publishers" },
  { code: "517311", desc: "Wired Telecommunications Carriers" },
  { code: "518210", desc: "Data Processing & Hosting Services" },
  { code: "519130", desc: "Internet Publishing & Web Search Portals" },
  { code: "541330", desc: "Engineering Services" },
  { code: "541380", desc: "Testing Laboratories" },
  { code: "541511", desc: "Custom Computer Programming Services" },
  { code: "541512", desc: "Computer Systems Design Services" },
  { code: "541513", desc: "Computer Facilities Management Services" },
  { code: "541519", desc: "Other Computer Related Services" },
  { code: "541611", desc: "Administrative Management Consulting" },
  { code: "541612", desc: "Human Resources Consulting" },
  { code: "541613", desc: "Marketing Consulting Services" },
  { code: "541614", desc: "Process, Physical Distribution Consulting" },
  { code: "541618", desc: "Other Management Consulting" },
  { code: "541620", desc: "Environmental Consulting" },
  { code: "541690", desc: "Other Scientific & Technical Consulting" },
  { code: "541711", desc: "Research & Development in Biotechnology" },
  { code: "541712", desc: "R&D in Physical, Engineering, Life Sciences" },
  { code: "541715", desc: "R&D in Nanotechnology" },
  { code: "541720", desc: "Research & Development in Social Sciences" },
  { code: "541990", desc: "All Other Professional & Technical Services" },
  { code: "561110", desc: "Office Administrative Services" },
  { code: "561210", desc: "Facilities Support Services" },
  { code: "561320", desc: "Temporary Help Services" },
  { code: "561410", desc: "Document Preparation Services" },
  { code: "561612", desc: "Security Guards and Patrol Services" },
  { code: "561621", desc: "Security Systems Services" },
  { code: "611430", desc: "Professional & Management Training" },
  { code: "611519", desc: "Other Technical & Trade Schools" },
  { code: "621111", desc: "Offices of Physicians" },
  { code: "811210", desc: "Electronic Equipment Repair & Maintenance" },
  { code: "928110", desc: "National Security" },
];

export function AgencyTypeahead({
  label,
  selected,
  onAdd,
  onRemove,
}: {
  label: string;
  selected: string[];
  onAdd: (agency: string) => void;
  onRemove: (agency: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const matches = query.length >= 1
    ? FEDERAL_AGENCIES.filter(a =>
        a.toLowerCase().includes(query.toLowerCase()) && !selected.includes(a)
      ).slice(0, 8)
    : [];

  return (
    <div>
      <label className="block text-xs text-[#64748b] mb-1.5 font-medium uppercase tracking-wide">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {selected.map(a => (
          <span key={a} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/20 rounded-full">
            {a}
            <button type="button" onClick={() => onRemove(a)} className="hover:text-[#dc2626] ml-0.5">&times;</button>
          </span>
        ))}
      </div>
      <div ref={ref} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (query.length >= 1) setOpen(true); }}
          placeholder="Type to search agencies..."
          className="w-full bg-white border border-[#e5e7eb] text-[#0f172a] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]"
        />
        {open && matches.length > 0 && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#e5e7eb] rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
            {matches.map(a => (
              <button
                key={a}
                type="button"
                onClick={() => { onAdd(a); setQuery(""); setOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-sm text-[#0f172a] hover:bg-[#f1f5f9] transition-colors"
              >
                {a}
              </button>
            ))}
          </div>
        )}
        {open && query.length >= 1 && matches.length === 0 && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#e5e7eb] rounded-lg shadow-lg px-4 py-3 text-sm text-[#94a3b8]">
            No matching agencies
          </div>
        )}
      </div>
    </div>
  );
}

export function NaicsTypeahead({
  label,
  selected,
  onAdd,
  onRemove,
}: {
  label: string;
  selected: string[];
  onAdd: (code: string) => void;
  onRemove: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const matches = query.length >= 1
    ? COMMON_NAICS.filter(n =>
        (n.code.includes(query) || n.desc.toLowerCase().includes(query.toLowerCase())) &&
        !selected.includes(n.code)
      ).slice(0, 8)
    : [];

  return (
    <div>
      <label className="block text-xs text-[#64748b] mb-1.5 font-medium uppercase tracking-wide">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {selected.map(code => {
          const info = COMMON_NAICS.find(n => n.code === code);
          return (
            <span key={code} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-mono bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/20 rounded-full">
              {code}{info ? ` — ${info.desc}` : ""}
              <button type="button" onClick={() => onRemove(code)} className="hover:text-[#dc2626] ml-0.5">&times;</button>
            </span>
          );
        })}
      </div>
      <div ref={ref} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (query.length >= 1) setOpen(true); }}
          placeholder="Type code or description (e.g. 541 or consulting)..."
          className="w-full bg-white border border-[#e5e7eb] text-[#0f172a] px-4 py-3 text-sm focus:outline-none focus:border-[#2563eb]"
        />
        {open && matches.length > 0 && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#e5e7eb] rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
            {matches.map(n => (
              <button
                key={n.code}
                type="button"
                onClick={() => { onAdd(n.code); setQuery(""); setOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-sm text-[#0f172a] hover:bg-[#f1f5f9] transition-colors"
              >
                <span className="font-mono font-medium">{n.code}</span>
                <span className="text-[#64748b] ml-2">— {n.desc}</span>
              </button>
            ))}
          </div>
        )}
        {open && query.length >= 1 && matches.length === 0 && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#e5e7eb] rounded-lg shadow-lg px-4 py-3 text-sm text-[#94a3b8]">
            No matching NAICS codes
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Single-select pickers (for forms where only one value is needed) ── */

export function AgencyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { setQuery(value); }, [value]);

  const matches = query.length >= 1
    ? FEDERAL_AGENCIES.filter(a => a.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (query.length >= 1) setOpen(true); }}
        placeholder="Type to search agencies..."
        className="w-full bg-white border border-[#e5e7eb] text-[#0f172a] px-3 py-2 text-sm rounded focus:outline-none focus:border-[#2563eb]"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#e5e7eb] rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
          {matches.map(a => (
            <button
              key={a}
              type="button"
              onClick={() => { onChange(a); setQuery(a); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-[#0f172a] hover:bg-[#f1f5f9] transition-colors"
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NaicsPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { setQuery(value); }, [value]);

  const matches = query.length >= 1
    ? COMMON_NAICS.filter(n =>
        n.code.includes(query) || n.desc.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (query.length >= 1) setOpen(true); }}
        placeholder="Type code or description..."
        className="w-full bg-white border border-[#e5e7eb] text-[#0f172a] px-3 py-2 text-sm rounded focus:outline-none focus:border-[#2563eb]"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#e5e7eb] rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
          {matches.map(n => (
            <button
              key={n.code}
              type="button"
              onClick={() => { onChange(n.code); setQuery(`${n.code} — ${n.desc}`); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-[#0f172a] hover:bg-[#f1f5f9] transition-colors"
            >
              <span className="font-mono font-medium">{n.code}</span>
              <span className="text-[#64748b] ml-2">— {n.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
