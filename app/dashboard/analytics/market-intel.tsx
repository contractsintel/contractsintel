"use client";

import { useState, useCallback } from "react";
import { useDashboard } from "../context";

interface SpendingTrend {
  fiscal_year: number;
  amount: number;
  awards: number;
}

interface Contractor {
  rank: number;
  name: string;
  amount: number;
  count: number;
}

interface AgencySpend {
  name: string;
  amount: number;
  count: number;
}

export function MarketIntelligence() {
  const { organization } = useDashboard();
  const naicsCodes = organization.naics_codes || [];

  const [selectedNaics, setSelectedNaics] = useState(naicsCodes[0] || "");
  const [selectedAgency, setSelectedAgency] = useState("");
  const [fiscalYear, setFiscalYear] = useState(2025);
  const [loading, setLoading] = useState(false);

  // Data states
  const [marketSize, setMarketSize] = useState<{
    total_spending: number;
    total_awards: number;
    top_agencies: AgencySpend[];
  } | null>(null);
  const [topContractors, setTopContractors] = useState<Contractor[]>([]);
  const [spendingTrend, setSpendingTrend] = useState<SpendingTrend[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const runAnalysis = useCallback(async () => {
    if (!selectedNaics) return;
    setLoading(true);
    setHasSearched(true);

    try {
      const [marketRes, contractorsRes, trendRes] = await Promise.all([
        fetch("/api/analytics/spending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysis_type: "naics_market",
            naics_code: selectedNaics,
            fiscal_year: fiscalYear,
          }),
        }),
        fetch("/api/analytics/spending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysis_type: "top_contractors",
            naics_code: selectedNaics,
            agency: selectedAgency || undefined,
            fiscal_year: fiscalYear,
          }),
        }),
        fetch("/api/analytics/spending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysis_type: "spending_trend",
            naics_code: selectedNaics,
            agency: selectedAgency || undefined,
          }),
        }),
      ]);

      const [market, contractors, trend] = await Promise.all([
        marketRes.json(),
        contractorsRes.json(),
        trendRes.json(),
      ]);

      setMarketSize(market);
      setTopContractors(contractors.contractors || []);
      setSpendingTrend(trend.trend || []);
    } catch (err) {
      console.error("Spending analysis error:", err);
    }
    setLoading(false);
  }, [selectedNaics, selectedAgency, fiscalYear]);

  const fmt = (n: number) => {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };

  const maxTrend = Math.max(...spendingTrend.map((t) => t.amount), 1);

  return (
    <div>
      {/* Filters */}
      <div className="border border-[#e5e7eb] bg-white p-5 mb-6">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-1">
              NAICS Code
            </label>
            <select
              value={selectedNaics}
              onChange={(e) => setSelectedNaics(e.target.value)}
              className="h-9 px-3 text-[13px] border border-[#e5e7eb] bg-white text-[#0f172a] focus:outline-none focus:border-[#2563eb] min-w-[180px]"
            >
              {naicsCodes.length === 0 && <option value="">No NAICS codes set</option>}
              {naicsCodes.map((n: string) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-1">
              Agency (optional)
            </label>
            <select
              value={selectedAgency}
              onChange={(e) => setSelectedAgency(e.target.value)}
              className="h-9 px-3 text-[13px] border border-[#e5e7eb] bg-white text-[#0f172a] focus:outline-none focus:border-[#2563eb]"
            >
              <option value="">All agencies</option>
              {["DoD","Army","Navy","Air Force","Marines","Space Force","DHS","VA","HHS","GSA","DOE","DOT","EPA","NASA","USDA","DOJ","DOI","DOL","Commerce","Treasury","State","Education","HUD","SBA","USAID","SSA","OPM","FEMA","CBP","ICE","USCG","FBI","DEA","DISA","DARPA","NGA","USACE","MDA","DHA","NRC","FAA","NOAA","IRS"].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-1">
              Fiscal Year
            </label>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(parseInt(e.target.value))}
              className="h-9 px-3 text-[13px] border border-[#e5e7eb] bg-white text-[#0f172a] focus:outline-none focus:border-[#2563eb]"
            >
              {[2025, 2024, 2023, 2022, 2021].map((y) => (
                <option key={y} value={y}>FY{y}</option>
              ))}
            </select>
          </div>
          <button
            onClick={runAnalysis}
            disabled={loading || !selectedNaics}
            className="h-9 px-5 text-[13px] font-medium bg-[#2563eb] text-white hover:bg-[#3b82f6] disabled:opacity-50 transition-colors"
          >
            {loading ? "Analyzing..." : "Analyze Market"}
          </button>
        </div>
      </div>

      {!hasSearched && naicsCodes.length === 0 && (
        <div className="text-center py-16">
          <span className="text-4xl">📊</span>
          <h3 className="text-sm font-medium text-[#0f172a] mt-4">Add NAICS codes to unlock Spend Lens</h3>
          <p className="text-xs text-[#64748b] mt-2 max-w-md mx-auto">
            Market intelligence requires at least one NAICS code. Add your codes in Settings to analyze federal spending trends, top contractors, and buying agencies.
          </p>
          <a
            href="/dashboard/settings"
            className="inline-block mt-4 text-xs font-medium text-white bg-[#3b82f6] hover:bg-[#2563eb] px-4 py-2 rounded-lg transition-colors"
          >
            Add NAICS Codes →
          </a>
        </div>
      )}

      {!hasSearched && naicsCodes.length > 0 && (
        <div className="text-center text-[#94a3b8] py-16 text-sm">
          Select a NAICS code and click &ldquo;Analyze Market&rdquo; to see spending intelligence from USASpending.gov
        </div>
      )}

      {loading && (
        <div className="text-center text-[#94a3b8] py-16 text-sm">
          Fetching data from USASpending.gov...
        </div>
      )}

      {hasSearched && !loading && marketSize && (
        <>
          {/* Market Size Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="border border-[#e5e7eb] bg-white p-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-1">
                Total Market Size (FY{fiscalYear})
              </div>
              <div className="text-2xl font-mono text-[#0f172a]">
                {fmt(marketSize.total_spending)}
              </div>
              <div className="text-xs text-[#64748b] mt-1">
                NAICS {selectedNaics}
              </div>
            </div>
            <div className="border border-[#e5e7eb] bg-white p-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-1">
                Total Awards
              </div>
              <div className="text-2xl font-mono text-[#0f172a]">
                {marketSize.total_awards.toLocaleString()}
              </div>
              <div className="text-xs text-[#64748b] mt-1">
                Avg {fmt(marketSize.total_awards > 0 ? marketSize.total_spending / marketSize.total_awards : 0)}/award
              </div>
            </div>
            <div className="border border-[#e5e7eb] bg-white p-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8] mb-1">
                Top Buying Agency
              </div>
              <div className="text-sm font-medium text-[#0f172a] mt-1 truncate">
                {marketSize.top_agencies?.[0]?.name || "N/A"}
              </div>
              <div className="text-xs text-[#64748b] mt-1">
                {marketSize.top_agencies?.[0] ? fmt(marketSize.top_agencies[0].amount) : ""}
              </div>
            </div>
          </div>

          {/* Spending Trend Bar Chart */}
          {spendingTrend.length > 0 && (
            <div className="border border-[#e5e7eb] bg-white mb-6">
              <div className="p-5 border-b border-[#e5e7eb]">
                <h2 className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8]">
                  5-Year Spending Trend — NAICS {selectedNaics}
                </h2>
              </div>
              <div className="p-5">
                <div className="flex items-end gap-3 h-[200px]">
                  {spendingTrend.map((t) => {
                    const pct = maxTrend > 0 ? (t.amount / maxTrend) * 100 : 0;
                    return (
                      <div key={t.fiscal_year} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div className="text-[10px] font-mono text-[#64748b] mb-1">
                          {fmt(t.amount)}
                        </div>
                        <div
                          className="w-full bg-[#2563eb] rounded-t transition-all"
                          style={{ height: `${Math.max(pct, 2)}%` }}
                        />
                        <div className="text-[10px] font-mono text-[#94a3b8] mt-2">
                          FY{t.fiscal_year}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Contractors */}
            {topContractors.length > 0 && (
              <div className="border border-[#e5e7eb] bg-white">
                <div className="p-5 border-b border-[#e5e7eb]">
                  <h2 className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8]">
                    Top Contractors — NAICS {selectedNaics}
                  </h2>
                </div>
                <div className="divide-y divide-[#e5e7eb]">
                  {topContractors.slice(0, 15).map((c) => (
                    <div key={c.rank} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-[#94a3b8] w-5">#{c.rank}</span>
                        <span className="text-xs text-[#0f172a] truncate max-w-[200px]">{c.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono text-[#0f172a]">{fmt(c.amount)}</div>
                        <div className="text-[10px] text-[#94a3b8]">{c.count} awards</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Buying Agencies */}
            {marketSize.top_agencies && marketSize.top_agencies.length > 0 && (
              <div className="border border-[#e5e7eb] bg-white">
                <div className="p-5 border-b border-[#e5e7eb]">
                  <h2 className="text-[10px] font-medium uppercase tracking-wide text-[#94a3b8]">
                    Top Buying Agencies — NAICS {selectedNaics}
                  </h2>
                </div>
                <div className="divide-y divide-[#e5e7eb]">
                  {marketSize.top_agencies.slice(0, 10).map((a, i) => {
                    const maxAgency = marketSize.top_agencies[0]?.amount || 1;
                    const barWidth = (a.amount / maxAgency) * 100;
                    return (
                      <div key={i} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[#0f172a] truncate max-w-[250px]">{a.name}</span>
                          <span className="text-xs font-mono text-[#0f172a]">{fmt(a.amount)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#2563eb] rounded-full"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
