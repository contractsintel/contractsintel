import type { ScraperResult } from "./index";

// State procurement portals require per-state HTML scraping configuration.
// Each state has a unique portal with different HTML structures, authentication
// requirements, and data formats. This stub logs the requirement and returns
// 0 opportunities until individual state scrapers are configured.

const STATE_PORTALS = [
  { state: "AL", name: "Alabama", url: "https://purchasing.alabama.gov/" },
  { state: "AK", name: "Alaska", url: "https://iris-vss.state.ak.us/webapp/PRDVSS1X1/AltSelfService" },
  { state: "AZ", name: "Arizona", url: "https://spo.az.gov/" },
  { state: "AR", name: "Arkansas", url: "https://www.arkansas.gov/dfa/procurement/" },
  { state: "CA", name: "California", url: "https://caleprocure.ca.gov/" },
  { state: "CO", name: "Colorado", url: "https://bids.coloradovssc.com/" },
  { state: "CT", name: "Connecticut", url: "https://portal.ct.gov/DAS/Procurement/" },
  { state: "DE", name: "Delaware", url: "https://contracts.delaware.gov/" },
  { state: "FL", name: "Florida", url: "https://vendor.myfloridamarketplace.com/" },
  { state: "GA", name: "Georgia", url: "https://ssl.doas.state.ga.us/gpr/" },
  { state: "HI", name: "Hawaii", url: "https://hands.hawaii.gov/" },
  { state: "ID", name: "Idaho", url: "https://purchasing.idaho.gov/" },
  { state: "IL", name: "Illinois", url: "https://www.bidbuy.illinois.gov/" },
  { state: "IN", name: "Indiana", url: "https://www.in.gov/idoa/procurement/" },
  { state: "IA", name: "Iowa", url: "https://bidopportunities.iowa.gov/" },
  { state: "KS", name: "Kansas", url: "https://supplier.sok.ks.gov/" },
  { state: "KY", name: "Kentucky", url: "https://emars.ky.gov/" },
  { state: "LA", name: "Louisiana", url: "https://wwwprd.doa.louisiana.gov/osp/lapac/pubmain.asp" },
  { state: "ME", name: "Maine", url: "https://www.maine.gov/purchases/" },
  { state: "MD", name: "Maryland", url: "https://emaryland.buyspeed.com/" },
  { state: "MA", name: "Massachusetts", url: "https://www.commbuys.com/" },
  { state: "MI", name: "Michigan", url: "https://sigma.michigan.gov/" },
  { state: "MN", name: "Minnesota", url: "https://mn.gov/admin/osp/" },
  { state: "MS", name: "Mississippi", url: "https://www.ms.gov/dfa/contract_bid_search/" },
  { state: "MO", name: "Missouri", url: "https://www.moolb.mo.gov/" },
  { state: "MT", name: "Montana", url: "https://svc.mt.gov/gsd/OneStop/" },
  { state: "NE", name: "Nebraska", url: "https://das.nebraska.gov/materiel/purchasing.html" },
  { state: "NV", name: "Nevada", url: "https://nevadaepro.com/" },
  { state: "NH", name: "New Hampshire", url: "https://apps.das.nh.gov/bidscontracts/" },
  { state: "NJ", name: "New Jersey", url: "https://www.njstart.gov/" },
  { state: "NM", name: "New Mexico", url: "https://www.generalservices.state.nm.us/" },
  { state: "NY", name: "New York", url: "https://ogs.ny.gov/procurement" },
  { state: "NC", name: "North Carolina", url: "https://www.ips.state.nc.us/" },
  { state: "ND", name: "North Dakota", url: "https://www.nd.gov/omb/agency/procurement/" },
  { state: "OH", name: "Ohio", url: "https://procure.ohio.gov/" },
  { state: "OK", name: "Oklahoma", url: "https://oklahoma.gov/omes/services/purchasing.html" },
  { state: "OR", name: "Oregon", url: "https://orpin.oregon.gov/" },
  { state: "PA", name: "Pennsylvania", url: "https://www.emarketplace.state.pa.us/" },
  { state: "RI", name: "Rhode Island", url: "https://www.ridop.ri.gov/" },
  { state: "SC", name: "South Carolina", url: "https://procurement.sc.gov/" },
  { state: "SD", name: "South Dakota", url: "https://bop.sd.gov/" },
  { state: "TN", name: "Tennessee", url: "https://tn.gov/generalservices/procurement.html" },
  { state: "TX", name: "Texas", url: "https://www.txsmartbuy.com/" },
  { state: "UT", name: "Utah", url: "https://purchasing.utah.gov/" },
  { state: "VT", name: "Vermont", url: "https://bgs.vermont.gov/purchasing-contracting" },
  { state: "VA", name: "Virginia", url: "https://eva.virginia.gov/" },
  { state: "WA", name: "Washington", url: "https://fortress.wa.gov/ga/webs/" },
  { state: "WV", name: "West Virginia", url: "https://state.wv.gov/admin/purchase/" },
  { state: "WI", name: "Wisconsin", url: "https://vendornet.wi.gov/" },
  { state: "WY", name: "Wyoming", url: "https://sites.google.com/wyo.gov/procurement/" },
  { state: "DC", name: "District of Columbia", url: "https://ocp.dc.gov/" },
  { state: "PR", name: "Puerto Rico", url: "https://www.asg.pr.gov/" },
  { state: "GU", name: "Guam", url: "https://www.guamopa.com/" },
  { state: "VI", name: "US Virgin Islands", url: "https://dpp.vi.gov/" },
  { state: "AS", name: "American Samoa", url: "https://www.americansamoa.gov/procurement" },
];

export { STATE_PORTALS };

export async function scrapeStateLocal(_supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  console.log(
    `[state-local] ${STATE_PORTALS.length} state/territory portals registered. ` +
    `Each portal requires per-state HTML scraping configuration. ` +
    `Source requires manual configuration for each state's unique portal structure.`
  );

  return {
    source: "state_local",
    status: "stub",
    opportunities_found: 0,
    matches_created: 0,
    error_message:
      "State portals require per-state HTML scraping configuration. " +
      `${STATE_PORTALS.length} portals registered but not yet active.`,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  };
}
