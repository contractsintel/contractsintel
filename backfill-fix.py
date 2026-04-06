#!/usr/bin/env python3
"""
ContractsIntel BACKFILL FIX — Address all remaining issues:
1. Grants.gov: fetch ALL 1684 with proper new IDs
2. Failing state portals: use longer waits, retry with different URLs
3. SAM.gov: try without API key via public search
4. SBIR API: try alternative endpoints
"""

import json
import time
import urllib.request
import urllib.parse
import urllib.error
import os
import re
import hashlib
from datetime import datetime, timedelta

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qpyskwvhgclrlychhxjk.supabase.co")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]  # required
PUPPETEER_URL = "https://puppeteer-production-f147.up.railway.app"
PUPPETEER_TOKEN = "ci-puppeteer-2026"

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

stats = {"total_upserted": 0}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def delay(s=2):
    time.sleep(s)

def upsert_opportunities(records):
    if not records:
        return 0
    clean = []
    for r in records:
        if not r.get("notice_id") or not r.get("title"):
            continue
        r["last_seen_at"] = datetime.utcnow().isoformat()
        # Ensure numeric fields are int
        for f in ("value_estimate", "incumbent_value"):
            if f in r and r[f] is not None:
                try:
                    r[f] = int(r[f])
                except (ValueError, TypeError):
                    r[f] = None
        clean.append(r)
    if not clean:
        return 0

    total = 0
    for i in range(0, len(clean), 100):
        batch = clean[i:i+100]
        try:
            data = json.dumps(batch).encode()
            url = f"{SUPABASE_URL}/rest/v1/opportunities?on_conflict=notice_id"
            req = urllib.request.Request(url, data=data, headers=SB_HEADERS, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                total += len(batch)
        except urllib.error.HTTPError as e:
            # One-by-one fallback
            for record in batch:
                try:
                    d2 = json.dumps([record]).encode()
                    r2 = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/opportunities?on_conflict=notice_id",
                                               data=d2, headers=SB_HEADERS, method="POST")
                    with urllib.request.urlopen(r2, timeout=15):
                        total += 1
                except:
                    pass
        except:
            pass

    stats["total_upserted"] += total
    return total

def fetch_json(url, method="GET", body=None, timeout=30, retries=3):
    for attempt in range(retries):
        try:
            if body:
                data = json.dumps(body).encode() if isinstance(body, dict) else body.encode()
                req = urllib.request.Request(url, data=data, headers={
                    "Content-Type": "application/json", "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (compatible; ContractsIntel/1.0)",
                }, method=method)
            else:
                req = urllib.request.Request(url, headers={
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (compatible; ContractsIntel/1.0)",
                })
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
            else:
                raise

def fetch_html(url, timeout=15, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            })
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(3 * (attempt + 1))
            else:
                raise

def fetch_with_puppeteer(url, wait_ms=8000, retries=3):
    for attempt in range(retries):
        try:
            api_url = f"{PUPPETEER_URL}/render?url={urllib.parse.quote(url, safe='')}&wait={wait_ms}"
            req = urllib.request.Request(api_url, headers={"Authorization": f"Bearer {PUPPETEER_TOKEN}"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode())
                if data.get("success") and data.get("html"):
                    return data["html"]
                raise Exception(f"No HTML: {data.get('error', 'unknown')}")
        except Exception as e:
            if attempt < retries - 1:
                log(f"    Puppeteer retry {attempt+1} for {url[:60]}: {e}")
                time.sleep(8 * (attempt + 1))
            else:
                raise

def make_notice_id(prefix, *parts):
    raw = "-".join(str(p) for p in parts if p)
    h = hashlib.md5(raw.encode()).hexdigest()[:12]
    return f"{prefix}-{h}"

def extract_links(html, base_url=""):
    links = []
    for m in re.finditer(r'<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)</a>', html, re.IGNORECASE):
        href, text = m.group(1), re.sub(r'<[^>]+>', '', m.group(2)).strip()
        if text and 5 < len(text) < 300:
            if not href.startswith("http"):
                try: href = urllib.parse.urljoin(base_url, href)
                except: continue
            links.append({"text": text, "href": href})
    return links

def extract_table_rows(html):
    rows = []
    for tr in re.finditer(r'<tr[^>]*>([\s\S]*?)</tr>', html, re.IGNORECASE):
        cells = [re.sub(r'<[^>]+>', '', td).strip()
                 for td in re.findall(r'<td[^>]*>([\s\S]*?)</td>', tr.group(1), re.IGNORECASE)]
        cells = [c for c in cells if c]
        if len(cells) >= 2:
            rows.append(" | ".join(cells))
    return rows

def find_pagination_urls(html, base_url):
    urls = set()
    for pattern in [
        r'<a[^>]+href="([^"]*)"[^>]*>(?:[^<]*(?:next|Next|NEXT|›|»|>>)[^<]*)</a>',
        r'<a[^>]+(?:rel="next"|aria-label="[^"]*next[^"]*")[^>]*href="([^"]*)"',
        r'<a[^>]+href="([^"]*(?:[?&](?:page|p|pg|start|offset|pageNumber)=\d+)[^"]*)"',
    ]:
        for m in re.finditer(pattern, html, re.IGNORECASE):
            href = m.group(1)
            if href and not href.startswith("javascript:") and not href.startswith("#"):
                try: urls.add(urllib.parse.urljoin(base_url, href))
                except: pass
    return list(urls)


# ============================================================
# FIX 1: Grants.gov — full repagination with proper upsert
# ============================================================
def fix_grants_gov():
    log("=== FIX: GRANTS.GOV (full repagination) ===")
    api_url = "https://apply07.grants.gov/grantsws/rest/opportunities/search"
    PER_PAGE = 500
    offset = 0
    total_saved = 0
    hit_count = 0

    while True:
        payload = {
            "keyword": "",
            "oppStatuses": "forecasted|posted",
            "sortBy": "openDate|desc",
            "rows": PER_PAGE,
            "offset": offset,
        }
        try:
            data = fetch_json(api_url, method="POST", body=payload, timeout=30)
        except Exception as e:
            log(f"  Offset {offset} failed: {e}")
            break

        opportunities = data.get("oppHits", [])
        hit_count = data.get("hitCount", 0)
        if not opportunities:
            break

        records = []
        for opp in opportunities:
            opp_id = opp.get("id") or opp.get("opportunityId")
            if not opp_id:
                continue
            title = opp.get("title") or opp.get("opportunityTitle") or "Untitled Grant"
            agency = opp.get("agency") or opp.get("agencyCode") or "Unknown"
            number = opp.get("number") or opp.get("opportunityNumber") or str(opp_id)
            close_date = opp.get("closeDate") or opp.get("closeDateStr")
            open_date = opp.get("openDate") or opp.get("openDateStr")
            value = opp.get("estimatedTotalFunding") or opp.get("awardCeiling")
            desc = opp.get("description", "")

            def parse_date(d):
                if not d: return None
                parts = d.split("/")
                if len(parts) == 3: return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
                return d

            records.append({
                "notice_id": f"grants-gov-{opp_id}",
                "title": title,
                "agency": agency,
                "solicitation_number": number,
                "value_estimate": int(value) if value else None,
                "response_deadline": parse_date(close_date),
                "posted_date": parse_date(open_date),
                "description": (desc or "")[:10000] or None,
                "source": "grants_gov",
                "source_url": f"https://www.grants.gov/search-results-detail/{opp_id}",
            })

        saved = upsert_opportunities(records)
        total_saved += saved
        offset += PER_PAGE
        log(f"  Offset {offset - PER_PAGE}: {len(opportunities)} grants, saved {saved} (total: {total_saved}/{hit_count})")

        if len(opportunities) < PER_PAGE or offset >= hit_count:
            break
        delay(1)

    log(f"  GRANTS.GOV: {total_saved} upserted out of {hit_count} available")
    return total_saved


# ============================================================
# FIX 2: Failing state portals — longer waits, alt URLs
# ============================================================
def fix_failing_states():
    log("=== FIX: FAILING STATE PORTALS (longer Puppeteer waits) ===")

    # States that failed with 500 — try with longer wait, alternative URLs
    FAILING_STATES = [
        ("AK", "Alaska", [
            "https://iris-vss.state.ak.us/webapp/PRDVSS1X1/AltSelfService",
            "https://state.prior.alaska.gov/doa/dgs/procurement.html",
        ]),
        ("CO", "Colorado", [
            "https://bids.coloradovssc.com/",
            "https://www.colorado.gov/pacific/osc/solicitations",
        ]),
        ("HI", "Hawaii", [
            "https://hands.hawaii.gov/",
            "https://spo.hawaii.gov/for-vendors/",
        ]),
        ("MD", "Maryland", [
            "https://emaryland.buyspeed.com/bso/view/search/external/advancedSearchBid.xhtml",
            "https://procurement.maryland.gov/",
        ]),
        ("MI", "Michigan", [
            "https://sigma.michigan.gov/webapp/PRDVSS2X1/AltSelfService",
            "https://www.michigan.gov/dtmb/procurement",
        ]),
        ("MO", "Missouri", [
            "https://www.moolb.mo.gov/MOSCEnterprise/solicitationSearch.html",
            "https://oa.mo.gov/purchasing/vendor-information/bid-opportunities",
        ]),
        ("MT", "Montana", [
            "https://svc.mt.gov/gsd/OneStop/",
            "https://mtstatebids.mt.gov/",
        ]),
        ("NC", "North Carolina", [
            "https://www.ips.state.nc.us/",
            "https://www.nc.gov/services/bid-opportunities",
        ]),
        ("SD", "South Dakota", [
            "https://bop.sd.gov/",
            "https://bop.sd.gov/vendors/",
        ]),
        ("TN", "Tennessee", [
            "https://tn.gov/generalservices/procurement/central-procurement-office--cpo-/solicitations.html",
        ]),
        ("WV", "West Virginia", [
            "https://state.wv.gov/admin/purchase/",
            "https://www.state.wv.gov/admin/purchase/Pages/default.aspx",
        ]),
        ("NM", "New Mexico", [
            "https://www.generalservices.state.nm.us/",
            "https://www.generalservices.state.nm.us/state-purchasing/",
        ]),
    ]

    total_saved = 0
    bid_kw = re.compile(r'bid|rfp|rfq|solicit|procurement|contract|itb|ifb|opportunity', re.I)

    for state_code, state_name, urls in FAILING_STATES:
        log(f"  {state_code} ({state_name})...")
        saved = 0

        for url in urls:
            try:
                log(f"    Trying {url[:60]}...")
                # Try Puppeteer with longer wait (10s)
                html = fetch_with_puppeteer(url, wait_ms=10000)

                if len(html) < 300:
                    log(f"    Too small ({len(html)} bytes), trying next URL")
                    continue

                records = []
                for link in extract_links(html, url):
                    if bid_kw.search(link["text"]) or bid_kw.search(link["href"]):
                        nid = make_notice_id(f"state-{state_code}", link["text"], link["href"])
                        records.append({
                            "notice_id": nid,
                            "title": f"[{state_code}] {link['text'][:200]}",
                            "agency": f"{state_name} State Procurement",
                            "source": "state_local",
                            "source_url": link["href"],
                            "description": link["text"],
                        })

                for row in extract_table_rows(html):
                    if bid_kw.search(row) or len(row) > 30:
                        nid = make_notice_id(f"state-{state_code}", row)
                        records.append({
                            "notice_id": nid,
                            "title": f"[{state_code}] {row[:200]}",
                            "agency": f"{state_name} State Procurement",
                            "source": "state_local",
                            "source_url": url,
                            "description": row[:2000],
                        })

                # Dedup
                seen = set()
                unique = [r for r in records if r["notice_id"] not in seen and not seen.add(r["notice_id"])]

                if unique:
                    saved = upsert_opportunities(unique)
                    log(f"    {state_code}: {saved} items from {url[:50]}")
                    break  # Got results, stop trying URLs
                else:
                    log(f"    No procurement data found, trying next URL")

            except Exception as e:
                log(f"    Failed: {e}")
                continue

            delay(2)

        if saved == 0:
            # Last resort: try direct HTML fetch (some sites work without JS)
            for url in urls:
                try:
                    html = fetch_html(url, timeout=15)
                    if len(html) > 500:
                        records = []
                        for link in extract_links(html, url):
                            if bid_kw.search(link["text"]) or bid_kw.search(link["href"]):
                                nid = make_notice_id(f"state-{state_code}", link["text"], link["href"])
                                records.append({
                                    "notice_id": nid,
                                    "title": f"[{state_code}] {link['text'][:200]}",
                                    "agency": f"{state_name} State Procurement",
                                    "source": "state_local",
                                    "source_url": link["href"],
                                    "description": link["text"],
                                })
                        for row in extract_table_rows(html):
                            nid = make_notice_id(f"state-{state_code}", row)
                            records.append({
                                "notice_id": nid,
                                "title": f"[{state_code}] {row[:200]}",
                                "agency": f"{state_name} State Procurement",
                                "source": "state_local",
                                "source_url": url,
                                "description": row[:2000],
                            })
                        seen = set()
                        unique = [r for r in records if r["notice_id"] not in seen and not seen.add(r["notice_id"])]
                        if unique:
                            saved = upsert_opportunities(unique)
                            log(f"    {state_code}: {saved} items (direct HTML) from {url[:50]}")
                            break
                except:
                    continue

        total_saved += saved
        log(f"  {state_code}: {saved} total")
        delay(1)

    log(f"  FAILING STATES FIX: {total_saved} total saved")
    return total_saved


# ============================================================
# FIX 3: SAM.gov — try Puppeteer scraping of search results
# ============================================================
def fix_sam_gov():
    log("=== FIX: SAM.GOV (Puppeteer scraping) ===")
    total_saved = 0

    # SAM.gov search is a React SPA — use Puppeteer
    search_urls = [
        "https://sam.gov/search/?index=opp&page=1&sort=-modifiedDate&sfm%5Bstatus%5D%5Bis_active%5D=true",
        "https://sam.gov/search/?index=opp&page=1&sort=-modifiedDate&sfm%5Bstatus%5D%5Bis_active%5D=true&sfm%5BsimpleSearch%5D%5BkeywordRadio%5D=ALL",
    ]

    for search_url in search_urls:
        try:
            log(f"  Trying SAM.gov search: {search_url[:60]}...")
            html = fetch_with_puppeteer(search_url, wait_ms=10000)

            if len(html) < 1000:
                log(f"  Too small ({len(html)} bytes)")
                continue

            records = []
            # Look for opportunity links
            opp_kw = re.compile(r'solicit|contract|award|opportunity|rfp|rfq|bid|procurement', re.I)
            for link in extract_links(html, "https://sam.gov"):
                if opp_kw.search(link["text"]) or "/opp/" in link["href"]:
                    nid = make_notice_id("sam-web", link["text"], link["href"])
                    records.append({
                        "notice_id": nid,
                        "title": link["text"][:200],
                        "agency": "SAM.gov",
                        "source": "sam_gov",
                        "source_url": link["href"],
                        "sam_url": link["href"],
                        "description": link["text"],
                    })

            for row in extract_table_rows(html):
                nid = make_notice_id("sam-web", row)
                records.append({
                    "notice_id": nid,
                    "title": f"[SAM.gov] {row[:200]}",
                    "agency": "SAM.gov",
                    "source": "sam_gov",
                    "source_url": search_url,
                    "description": row[:2000],
                })

            seen = set()
            unique = [r for r in records if r["notice_id"] not in seen and not seen.add(r["notice_id"])]

            if unique:
                saved = upsert_opportunities(unique)
                total_saved += saved
                log(f"  SAM.gov: {saved} items from Puppeteer")

                # Try to paginate
                for page_num in range(2, 20):
                    page_url = re.sub(r'page=\d+', f'page={page_num}', search_url)
                    try:
                        page_html = fetch_with_puppeteer(page_url, wait_ms=8000)
                        page_records = []
                        for link in extract_links(page_html, "https://sam.gov"):
                            if opp_kw.search(link["text"]) or "/opp/" in link["href"]:
                                nid = make_notice_id("sam-web", link["text"], link["href"])
                                page_records.append({
                                    "notice_id": nid,
                                    "title": link["text"][:200],
                                    "agency": "SAM.gov",
                                    "source": "sam_gov",
                                    "source_url": link["href"],
                                    "sam_url": link["href"],
                                    "description": link["text"],
                                })
                        if not page_records:
                            log(f"  SAM.gov page {page_num}: no results, stopping")
                            break
                        saved = upsert_opportunities(page_records)
                        total_saved += saved
                        log(f"  SAM.gov page {page_num}: {saved} items")
                        delay(3)
                    except Exception as e:
                        log(f"  SAM.gov page {page_num} failed: {e}")
                        break
                break  # Got results from this URL
            else:
                log(f"  No opportunities found")
        except Exception as e:
            log(f"  SAM.gov error: {e}")

    log(f"  SAM.GOV FIX: {total_saved} total saved")
    return total_saved


# ============================================================
# FIX 4: SBIR — try alternative endpoints
# ============================================================
def fix_sbir():
    log("=== FIX: SBIR.GOV (alternative endpoints) ===")
    total_saved = 0

    # Try multiple SBIR endpoints
    endpoints = [
        "https://www.sbir.gov/api/solicitations.json",
        "https://www.sbir.gov/sbirsearch/detail/all",
        "https://www.sbir.gov/solicitations/open",
    ]

    for endpoint in endpoints:
        try:
            log(f"  Trying {endpoint}...")
            if endpoint.endswith(".json"):
                data = fetch_json(endpoint, timeout=30)
                sols = data if isinstance(data, list) else data.get("solicitations", data.get("results", []))
                log(f"  Got {len(sols)} solicitations from API")

                records = []
                for sol in sols:
                    sol_id = sol.get("id") or sol.get("solicitation_id")
                    if not sol_id: continue
                    title = sol.get("solicitation_title") or sol.get("title") or "SBIR/STTR"
                    agency = sol.get("agency") or "Unknown"
                    program = sol.get("program") or sol.get("type") or "SBIR/STTR"
                    records.append({
                        "notice_id": f"sbir-{sol_id}",
                        "title": f"[{program}] {title}",
                        "agency": agency,
                        "solicitation_number": sol.get("solicitation_number") or str(sol_id),
                        "response_deadline": sol.get("close_date") or sol.get("closeDate"),
                        "posted_date": sol.get("open_date") or sol.get("openDate"),
                        "description": (sol.get("description") or "")[:10000] or None,
                        "source": "sbir_sttr",
                        "source_url": sol.get("solicitation_url") or f"https://www.sbir.gov/node/{sol_id}",
                    })

                saved = upsert_opportunities(records)
                total_saved += saved
                log(f"  SBIR API: {saved} saved")
                if saved > 0:
                    break
            else:
                # HTML endpoint — try Puppeteer
                html = fetch_with_puppeteer(endpoint, wait_ms=8000)
                sbir_kw = re.compile(r'sbir|sttr|solicit|topic|fund|grant|award|proposal', re.I)
                records = []
                for link in extract_links(html, "https://www.sbir.gov"):
                    if sbir_kw.search(link["text"]) or sbir_kw.search(link["href"]):
                        nid = make_notice_id("sbir-web", link["text"], link["href"])
                        records.append({
                            "notice_id": nid,
                            "title": f"[SBIR] {link['text'][:200]}",
                            "agency": "SBIR.gov",
                            "source": "sbir_sttr",
                            "source_url": link["href"],
                            "description": link["text"],
                        })
                saved = upsert_opportunities(records)
                total_saved += saved
                if saved > 0:
                    log(f"  SBIR HTML: {saved} saved")
                    break
        except Exception as e:
            log(f"  {endpoint}: failed - {e}")

    log(f"  SBIR FIX: {total_saved} total saved")
    return total_saved


# ============================================================
# MAIN
# ============================================================
def main():
    log("=" * 60)
    log("CONTRACTSINTEL BACKFILL FIX — STARTING")
    log("=" * 60)

    results = {}
    results["grants_gov"] = fix_grants_gov()
    results["failing_states"] = fix_failing_states()
    results["sam_gov"] = fix_sam_gov()
    results["sbir"] = fix_sbir()

    log("=" * 60)
    log("FIX COMPLETE — RESULTS")
    log("=" * 60)
    for source, count in results.items():
        log(f"  {source}: {count}")
    log(f"  TOTAL UPSERTED: {stats['total_upserted']}")
    log("=" * 60)

if __name__ == "__main__":
    main()
