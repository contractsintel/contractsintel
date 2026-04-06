import type { ScraperResult } from "./index";

// Military/Defense procurement portals are HTML-based and require
// per-source configuration. Most require CAC authentication or
// are behind government firewalls.

const MILITARY_SOURCES = [
  { id: "dla_dibbs", name: "DLA DIBBS", url: "https://www.dibbs.bsm.dla.mil/" },
  { id: "army_asfi", name: "Army ASFI", url: "https://acquisition.army.mil/asfi/" },
  { id: "army_acc", name: "Army Contracting Command", url: "https://acc.army.mil/contractingcenters/" },
  { id: "navy_neco", name: "Navy NECO", url: "https://www.neco.navy.mil/" },
  { id: "air_force", name: "Air Force Contracting", url: "https://www.afmc.af.mil/contracting/" },
  { id: "marines", name: "Marine Corps", url: "https://www.marcorsyscom.marines.mil/" },
  { id: "disa", name: "DISA Procurement", url: "https://www.disa.mil/About/Procurement" },
  { id: "darpa", name: "DARPA Contracts", url: "https://www.darpa.mil/work-with-us/contracting" },
  { id: "dha", name: "Defense Health Agency", url: "https://health.mil/About-MHS/OASDHA/Defense-Health-Agency/Procurement-and-Contracting" },
  { id: "mda", name: "Missile Defense Agency", url: "https://www.mda.mil/business/" },
  { id: "space_force", name: "Space Force", url: "https://www.spaceforce.mil/" },
  { id: "usace", name: "Army Corps of Engineers", url: "https://www.usace.army.mil/Business-With-Us/" },
  { id: "socom", name: "SOCOM", url: "https://www.socom.mil/SOF-ATL/Pages/default.aspx" },
  { id: "dcsa", name: "DCSA", url: "https://www.dcsa.mil/mc/pv/mbi/procurement/" },
];

export { MILITARY_SOURCES };

export async function scrapeMilitaryDefense(_supabase: any): Promise<ScraperResult> {
  const startedAt = new Date().toISOString();

  console.log(
    `[military-defense] ${MILITARY_SOURCES.length} military procurement sources registered. ` +
    `These sources require manual HTML scraping configuration. ` +
    `Many require CAC authentication or are behind government networks. ` +
    `Source requires manual configuration.`
  );

  return {
    source: "military_defense",
    status: "stub",
    opportunities_found: 0,
    matches_created: 0,
    error_message:
      `Military procurement portals require per-source HTML scraping configuration. ` +
      `${MILITARY_SOURCES.length} sources registered. Most require CAC authentication.`,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  };
}
