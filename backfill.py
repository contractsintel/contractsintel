#!/usr/bin/env python3
"""
ContractsIntel FULL BACKFILL — Every page of every source.
Uses Railway Puppeteer for JS rendering, direct API calls for JSON APIs.
Saves to Supabase via REST API.
"""

import json
import time
import urllib.request
import urllib.parse
import urllib.error
import ssl
import sys
import os
import hashlib
from datetime import datetime, timedelta

# ============================================================
# CONFIGURATION
# ============================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qpyskwvhgclrlychhxjk.supabase.co")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]  # required
PUPPETEER_URL = "https://puppeteer-production-f147.up.railway.app"
PUPPETEER_TOKEN = "ci-puppeteer-2026"

# Supabase REST headers
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

stats = {"total_upserted": 0, "errors": []}

# ============================================================
# HELPERS
# ============================================================
def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def delay(seconds=2):
    time.sleep(seconds + (hash(str(time.time())) % 30) / 10)

def upsert_opportunities(records):
    """Upsert records to Supabase opportunities table. Batch of up to 500."""
    if not records:
        return 0

    # Ensure all records have required fields
    clean = []
    for r in records:
        if not r.get("notice_id") or not r.get("title"):
            continue
        r["last_seen_at"] = datetime.utcnow().isoformat()
        clean.append(r)

    if not clean:
        return 0

    # Batch in groups of 200
    total = 0
    for i in range(0, len(clean), 200):
        batch = clean[i:i+200]
        try:
            data = json.dumps(batch).encode()
            url = f"{SUPABASE_URL}/rest/v1/opportunities?on_conflict=notice_id"
            req = urllib.request.Request(url, data=data, headers=SB_HEADERS, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                total += len(batch)
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:300]
            log(f"  Supabase upsert error {e.code}: {body}")
            # Try one-by-one for this batch
            for record in batch:
                try:
                    data2 = json.dumps([record]).encode()
                    url2 = f"{SUPABASE_URL}/rest/v1/opportunities?on_conflict=notice_id"
                    req2 = urllib.request.Request(url2, data=data2, headers=SB_HEADERS, method="POST")
                    with urllib.request.urlopen(req2, timeout=15) as resp2:
                        total += 1
                except Exception:
                    pass
        except Exception as e:
            log(f"  Supabase upsert exception: {e}")

    stats["total_upserted"] += total
    return total

def fetch_json(url, method="GET", body=None, headers=None, timeout=30, retries=3):
    """Fetch JSON from URL with retries."""
    hdrs = headers or {}
    for attempt in range(retries):
        try:
            if body:
                data = json.dumps(body).encode() if isinstance(body, dict) else body.encode()
                req = urllib.request.Request(url, data=data, headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (compatible; ContractsIntel/1.0)",
                    **hdrs
                }, method=method)
            else:
                req = urllib.request.Request(url, headers={
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (compatible; ContractsIntel/1.0)",
                    **hdrs
                }, method=method)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            if attempt < retries - 1:
                log(f"  Retry {attempt+1}/{retries} for {url[:80]}: {e}")
                time.sleep(5 * (attempt + 1))
            else:
                raise

def fetch_html(url, timeout=15, retries=3):
    """Fetch HTML directly (no JS rendering)."""
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

def fetch_with_puppeteer(url, wait_ms=5000, retries=3):
    """Fetch rendered HTML via Railway Puppeteer server."""
    for attempt in range(retries):
        try:
            api_url = f"{PUPPETEER_URL}/render?url={urllib.parse.quote(url, safe='')}&wait={wait_ms}"
            req = urllib.request.Request(api_url, headers={
                "Authorization": f"Bearer {PUPPETEER_TOKEN}",
            })
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read().decode())
                if data.get("success") and data.get("html"):
                    return data["html"]
                raise Exception(f"Puppeteer failed: {data.get('error', 'no HTML')}")
        except Exception as e:
            if attempt < retries - 1:
                log(f"  Puppeteer retry {attempt+1} for {url[:60]}: {e}")
                time.sleep(5 * (attempt + 1))
            else:
                raise

def make_notice_id(prefix, *parts):
    """Create a stable notice_id from parts."""
    raw = "-".join(str(p) for p in parts if p)
    h = hashlib.md5(raw.encode()).hexdigest()[:12]
    return f"{prefix}-{h}"

import re

def extract_links(html, base_url=""):
    """Extract all <a> links from HTML."""
    links = []
    for m in re.finditer(r'<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)</a>', html, re.IGNORECASE):
        href, text = m.group(1), re.sub(r'<[^>]+>', '', m.group(2)).strip()
        if text and 5 < len(text) < 300:
            if not href.startswith("http"):
                try:
                    href = urllib.parse.urljoin(base_url, href)
                except:
                    continue
            links.append({"text": text, "href": href})
    return links

def extract_table_rows(html):
    """Extract text from table rows."""
    rows = []
    for tr in re.finditer(r'<tr[^>]*>([\s\S]*?)</tr>', html, re.IGNORECASE):
        cells = [re.sub(r'<[^>]+>', '', td).strip()
                 for td in re.findall(r'<td[^>]*>([\s\S]*?)</td>', tr.group(1), re.IGNORECASE)]
        cells = [c for c in cells if c]
        if len(cells) >= 2:
            rows.append(" | ".join(cells))
    return rows

def has_next_page(html):
    """Check if HTML has pagination indicators."""
    patterns = [
        r'(?:next|Next|NEXT|›|»|>>|next\s*page)',
        r'class="[^"]*(?:next|pagination-next)[^"]*"',
        r'rel="next"',
        r'aria-label="[^"]*next[^"]*"',
    ]
    for p in patterns:
        if re.search(p, html):
            return True
    return False

def find_pagination_urls(html, base_url):
    """Find all pagination URLs in HTML."""
    urls = set()
    # Next links
    for m in re.finditer(r'<a[^>]+href="([^"]*)"[^>]*>(?:[^<]*(?:next|Next|NEXT|›|»|>>)[^<]*)</a>', html, re.IGNORECASE):
        href = m.group(1)
        if href and not href.startswith("javascript:") and not href.startswith("#"):
            try:
                urls.add(urllib.parse.urljoin(base_url, href))
            except:
                pass
    # Page param links
    for m in re.finditer(r'<a[^>]+href="([^"]*(?:[?&](?:page|p|pg|start|offset|pageNumber)=\d+)[^"]*)"', html, re.IGNORECASE):
        href = m.group(1)
        if href and not href.startswith("javascript:"):
            try:
                urls.add(urllib.parse.urljoin(base_url, href))
            except:
                pass
    # rel="next"
    for m in re.finditer(r'<a[^>]+(?:rel="next"|aria-label="[^"]*next[^"]*")[^>]*href="([^"]*)"', html, re.IGNORECASE):
        href = m.group(1)
        if href:
            try:
                urls.add(urllib.parse.urljoin(base_url, href))
            except:
                pass
    return list(urls)


# ============================================================
# SOURCE SCRAPERS
# ============================================================

def scrape_usaspending():
    """USASpending API — paginate through ALL contract awards from last 90 days."""
    log("=== USASPENDING (API) ===")
    api_url = "https://api.usaspending.gov/api/v2/search/spending_by_award/"

    today = datetime.utcnow().strftime("%Y-%m-%d")
    start_date = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")

    PER_PAGE = 100
    page = 1
    total_saved = 0

    while True:
        payload = {
            "filters": {
                "time_period": [{"start_date": start_date, "end_date": today}],
                "award_type_codes": ["A", "B", "C", "D"],
            },
            "fields": [
                "Award ID", "Recipient Name", "Award Amount",
                "Period of Performance Current End Date",
                "Awarding Agency", "Awarding Sub Agency",
                "Contract Award Type", "NAICS Code",
                "generated_internal_id", "Description",
            ],
            "limit": PER_PAGE,
            "page": page,
            "sort": "Award Amount",
            "order": "desc",
            "subawards": False,
        }

        try:
            data = fetch_json(api_url, method="POST", body=payload, timeout=30)
        except Exception as e:
            log(f"  Page {page} failed: {e}")
            if total_saved > 0:
                break
            stats["errors"].append(f"usaspending page {page}: {e}")
            break

        awards = data.get("results", [])
        if not awards:
            log(f"  Page {page}: no results, done.")
            break

        records = []
        for award in awards:
            award_id = award.get("Award ID")
            if not award_id:
                continue

            end_date = award.get("Period of Performance Current End Date")
            incumbent = award.get("Recipient Name")
            amount = award.get("Award Amount")
            agency = " / ".join(filter(None, [award.get("Awarding Agency"), award.get("Awarding Sub Agency")]))
            naics = award.get("NAICS Code")
            desc = award.get("Description", "")
            internal_id = award.get("generated_internal_id", award_id)

            amount_str = f"${amount/1e6:.1f}M" if amount else "unknown"
            title = f"Recompete: {(desc or agency or 'Expiring Contract')[:100]} ({incumbent or 'Unknown'})"
            reasoning = f"This {amount_str} contract with {incumbent or 'unknown'} at {agency} expires {end_date or 'soon'}."

            records.append({
                "notice_id": f"usaspending-{award_id}",
                "title": title,
                "agency": agency or "Unknown",
                "solicitation_number": award_id,
                "naics_code": naics,
                "value_estimate": int(amount) if amount else None,
                "response_deadline": end_date,
                "description": f"{reasoning}\n\nOriginal: {(desc or 'N/A')[:5000]}",
                "source": "usaspending",
                "source_url": f"https://www.usaspending.gov/award/{internal_id}",
                "incumbent_name": incumbent,
                "incumbent_value": int(amount) if amount else None,
            })

        saved = upsert_opportunities(records)
        total_saved += saved

        has_next = data.get("hasNext", data.get("has_next", len(awards) == PER_PAGE))
        log(f"  Page {page}: {len(awards)} awards, saved {saved} (total: {total_saved}, hasNext: {has_next})")

        if not has_next:
            break

        page += 1
        delay(1)

        # Safety: USASpending API can return many pages
        if page > 500:
            log(f"  Safety limit: stopped at page {page}")
            break

    log(f"  USASPENDING COMPLETE: {total_saved} total saved across {page} pages")
    return total_saved


def scrape_grants_gov():
    """Grants.gov API — paginate through ALL grants."""
    log("=== GRANTS.GOV (API) ===")
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
            if total_saved > 0:
                break
            stats["errors"].append(f"grants_gov offset {offset}: {e}")
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

            # Parse MM/DD/YYYY to YYYY-MM-DD
            def parse_date(d):
                if not d:
                    return None
                parts = d.split("/")
                if len(parts) == 3:
                    return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
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

    log(f"  GRANTS.GOV COMPLETE: {total_saved} total saved, {hit_count} total available")
    return total_saved


def scrape_sam_gov():
    """SAM.gov API — paginate through all recent opportunities."""
    log("=== SAM.GOV (API) ===")

    # SAM.gov requires API key
    sam_api_key = "REPLACE_WITH_SAM_KEY"  # Will try without key first
    today = datetime.utcnow()
    posted_from = (today - timedelta(days=30)).strftime("%m/%d/%Y")
    posted_to = today.strftime("%m/%d/%Y")

    endpoints = [
        "https://api.sam.gov/opportunities/v2/search",
        "https://api.sam.gov/prod/opportunities/v2/search",
    ]

    total_saved = 0

    for endpoint in endpoints:
        offset = 0
        limit = 1000

        while True:
            params_dict = {
                "postedFrom": posted_from,
                "postedTo": posted_to,
                "limit": str(limit),
                "offset": str(offset),
            }
            if sam_api_key and sam_api_key != "REPLACE_WITH_SAM_KEY":
                params_dict["api_key"] = sam_api_key
            params = urllib.parse.urlencode(params_dict)
            url = f"{endpoint}?{params}"

            try:
                data = fetch_json(url, headers={"Accept": "application/json"}, timeout=30)
            except Exception as e:
                log(f"  SAM.gov {endpoint} offset {offset} failed: {e}")
                if total_saved > 0:
                    break
                break  # try next endpoint

            opps = data.get("opportunitiesData", data.get("opportunities", []))
            if not opps:
                if offset == 0:
                    break  # try next endpoint
                break

            records = []
            for opp in opps:
                notice_id = opp.get("noticeId")
                if not notice_id:
                    continue

                agency = " / ".join(filter(None, [
                    opp.get("department"), opp.get("subtier"), opp.get("office")
                ]))
                pop = opp.get("placeOfPerformance", {})
                place_str = ", ".join(filter(None, [
                    (pop.get("city") or {}).get("name"),
                    (pop.get("state") or {}).get("code")
                ])) if pop else None

                records.append({
                    "notice_id": notice_id,
                    "title": opp.get("title", "Untitled"),
                    "agency": agency or "Unknown",
                    "solicitation_number": opp.get("solicitationNumber"),
                    "set_aside": opp.get("setAsideDescription") or opp.get("setAside"),
                    "naics_code": opp.get("naicsCode"),
                    "place_of_performance": place_str,
                    "response_deadline": opp.get("responseDeadLine"),
                    "posted_date": opp.get("postedDate"),
                    "description": (opp.get("description") or "")[:10000] or None,
                    "source": "sam_gov",
                    "source_url": opp.get("uiLink"),
                    "sam_url": opp.get("uiLink"),
                })

            saved = upsert_opportunities(records)
            total_saved += saved

            log(f"  Offset {offset}: {len(opps)} opps, saved {saved} (total: {total_saved})")

            total_records = data.get("totalRecords", 0)
            offset += limit

            if len(opps) < limit or (total_records and offset >= total_records):
                break

            delay(1)

        if total_saved > 0:
            break  # got results from this endpoint

    log(f"  SAM.GOV COMPLETE: {total_saved} total saved")
    return total_saved


def scrape_sbir_api():
    """SBIR.gov API — fetch all solicitations."""
    log("=== SBIR.GOV (API) ===")

    api_url = "https://www.sbir.gov/api/solicitations.json"
    total_saved = 0

    try:
        data = fetch_json(api_url, timeout=30)
        solicitations = data if isinstance(data, list) else data.get("solicitations", data.get("results", []))

        log(f"  API returned {len(solicitations)} solicitations")

        records = []
        for sol in solicitations:
            sol_id = sol.get("id") or sol.get("solicitation_id") or sol.get("solicitationId")
            if not sol_id:
                continue

            title = sol.get("solicitation_title") or sol.get("title") or "SBIR/STTR Solicitation"
            agency = sol.get("agency") or sol.get("branch") or "Unknown"
            number = sol.get("solicitation_number") or sol.get("number") or str(sol_id)
            close_date = sol.get("close_date") or sol.get("closeDate") or sol.get("application_due_date")
            open_date = sol.get("open_date") or sol.get("openDate") or sol.get("release_date")
            desc = sol.get("description") or sol.get("summary") or sol.get("abstract")
            program = sol.get("program") or sol.get("type")
            sol_url = sol.get("solicitation_url") or sol.get("url") or f"https://www.sbir.gov/node/{sol_id}"

            records.append({
                "notice_id": f"sbir-{sol_id}",
                "title": f"[{program or 'SBIR/STTR'}] {title}",
                "agency": agency,
                "solicitation_number": number,
                "response_deadline": close_date,
                "posted_date": open_date,
                "description": (desc or "")[:10000] or None,
                "source": "sbir_sttr",
                "source_url": sol_url,
            })

        total_saved = upsert_opportunities(records)
    except Exception as e:
        log(f"  SBIR API failed: {e}")
        stats["errors"].append(f"sbir_api: {e}")

    log(f"  SBIR API COMPLETE: {total_saved} total saved")
    return total_saved


def scrape_state_portal(state_code, state_name, url, use_puppeteer=False):
    """Scrape a single state portal with full pagination."""
    total_saved = 0
    all_pages_html = []

    try:
        # Fetch page 1
        if use_puppeteer:
            html = fetch_with_puppeteer(url, wait_ms=5000)
        else:
            html = fetch_html(url)

        if len(html) < 300:
            # Try Puppeteer as fallback
            try:
                html = fetch_with_puppeteer(url, wait_ms=5000)
            except:
                log(f"  {state_code}: minimal response, skipping")
                return 0

        all_pages_html.append(html)

        # Check for JS-required and retry with Puppeteer
        if ("JavaScript is required" in html or "enable JavaScript" in html) and not use_puppeteer:
            try:
                html = fetch_with_puppeteer(url, wait_ms=5000)
                all_pages_html[0] = html
            except Exception as e:
                log(f"  {state_code}: JS required, Puppeteer failed: {e}")
                return 0

        # Follow pagination
        current_url = url
        current_html = html
        page_num = 1

        while True:
            next_urls = find_pagination_urls(current_html, current_url)
            if not next_urls:
                break

            next_url = next_urls[0]
            if next_url == current_url:
                break

            page_num += 1
            try:
                if use_puppeteer:
                    page_html = fetch_with_puppeteer(next_url, wait_ms=3000)
                else:
                    page_html = fetch_html(next_url)

                if len(page_html) < 200:
                    break

                # Check for new content
                new_rows = extract_table_rows(page_html)
                new_links = [l for l in extract_links(page_html, url)
                           if re.search(r'bid|rfp|rfq|solicit|procurement|contract', l["text"] + " " + l["href"], re.I)]

                if not new_rows and not new_links:
                    break

                all_pages_html.append(page_html)
                current_html = page_html
                current_url = next_url
                delay(2)

            except Exception as e:
                log(f"  {state_code}: Page {page_num} error: {e}")
                break

        if len(all_pages_html) > 1:
            log(f"  {state_code}: Fetched {len(all_pages_html)} pages")

        # Parse all pages
        records = []
        bid_kw = re.compile(r'bid|rfp|rfq|solicit|procurement|contract|itb|ifb|opportunity', re.I)

        for pi, page_html in enumerate(all_pages_html):
            # Extract bid-related links
            for link in extract_links(page_html, url):
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

            # Extract table rows
            for row in extract_table_rows(page_html):
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

        # Deduplicate by notice_id
        seen = set()
        unique = []
        for r in records:
            if r["notice_id"] not in seen:
                seen.add(r["notice_id"])
                unique.append(r)

        total_saved = upsert_opportunities(unique)

    except Exception as e:
        log(f"  {state_code}: ERROR - {e}")
        stats["errors"].append(f"state_{state_code}: {e}")

    return total_saved


def scrape_all_states():
    """Scrape all 55 state/territory portals."""
    log("=== STATE PORTALS (55 states + territories) ===")

    # States that need Puppeteer (JS SPAs)
    JS_STATES = {
        "CA", "TX", "FL", "CO", "MD", "MI", "KY", "KS", "MO", "AK",
        "AZ", "NH", "DC", "TN", "AR", "NC", "LA", "MT", "PR", "SD", "WV", "HI",
    }

    JS_STATE_URLS = {
        "CA": "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx",
        "TX": "https://www.txsmartbuy.com/sp",
        "FL": "https://vendor.myfloridamarketplace.com/search/bids",
        "CO": "https://bids.coloradovssc.com/",
        "MD": "https://emaryland.buyspeed.com/bso/view/search/external/advancedSearchBid.xhtml",
        "MI": "https://sigma.michigan.gov/webapp/PRDVSS2X1/AltSelfService",
        "KY": "https://emars.ky.gov/online/vss/AltSelfService",
        "KS": "https://supplier.sok.ks.gov/psc/sokfssprd/SUPPLIER/ERP/h/?tab=SOK_EBID",
        "MO": "https://www.moolb.mo.gov/MOSCEnterprise/solicitationSearch.html",
        "AK": "https://iris-vss.state.ak.us/webapp/PRDVSS1X1/AltSelfService",
    }

    PORTALS = [
        ("AL", "Alabama", "https://purchasing.alabama.gov/"),
        ("AK", "Alaska", "https://iris-vss.state.ak.us/webapp/PRDVSS1X1/AltSelfService"),
        ("AZ", "Arizona", "https://spo.az.gov/contracts-and-solicitations"),
        ("AR", "Arkansas", "https://www.arkansas.gov/dfa/procurement/"),
        ("CA", "California", "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx"),
        ("CO", "Colorado", "https://bids.coloradovssc.com/"),
        ("CT", "Connecticut", "https://portal.ct.gov/DAS/Procurement/"),
        ("DE", "Delaware", "https://contracts.delaware.gov/"),
        ("FL", "Florida", "https://vendor.myfloridamarketplace.com/search/bids"),
        ("GA", "Georgia", "https://ssl.doas.state.ga.us/gpr/"),
        ("HI", "Hawaii", "https://hands.hawaii.gov/"),
        ("ID", "Idaho", "https://purchasing.idaho.gov/"),
        ("IL", "Illinois", "https://www.bidbuy.illinois.gov/"),
        ("IN", "Indiana", "https://www.in.gov/idoa/procurement/"),
        ("IA", "Iowa", "https://bidopportunities.iowa.gov/"),
        ("KS", "Kansas", "https://supplier.sok.ks.gov/"),
        ("KY", "Kentucky", "https://emars.ky.gov/"),
        ("LA", "Louisiana", "https://wwwprd.doa.louisiana.gov/osp/lapac/pubmain.asp"),
        ("ME", "Maine", "https://www.maine.gov/purchases/"),
        ("MD", "Maryland", "https://emaryland.buyspeed.com/"),
        ("MA", "Massachusetts", "https://www.commbuys.com/"),
        ("MI", "Michigan", "https://sigma.michigan.gov/"),
        ("MN", "Minnesota", "https://mn.gov/admin/osp/"),
        ("MS", "Mississippi", "https://www.ms.gov/dfa/contract_bid_search/"),
        ("MO", "Missouri", "https://www.moolb.mo.gov/"),
        ("MT", "Montana", "https://svc.mt.gov/gsd/OneStop/"),
        ("NE", "Nebraska", "https://das.nebraska.gov/materiel/purchasing.html"),
        ("NV", "Nevada", "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml"),
        ("NH", "New Hampshire", "https://apps.das.nh.gov/bidscontracts/"),
        ("NJ", "New Jersey", "https://www.njstart.gov/"),
        ("NM", "New Mexico", "https://www.generalservices.state.nm.us/"),
        ("NY", "New York", "https://ogs.ny.gov/procurement"),
        ("NC", "North Carolina", "https://www.ips.state.nc.us/"),
        ("ND", "North Dakota", "https://www.nd.gov/omb/agency/procurement/"),
        ("OH", "Ohio", "https://procure.ohio.gov/"),
        ("OK", "Oklahoma", "https://oklahoma.gov/omes/services/purchasing.html"),
        ("OR", "Oregon", "https://orpin.oregon.gov/open.dll/welcome"),
        ("PA", "Pennsylvania", "https://www.emarketplace.state.pa.us/"),
        ("RI", "Rhode Island", "https://www.ridop.ri.gov/"),
        ("SC", "South Carolina", "https://procurement.sc.gov/"),
        ("SD", "South Dakota", "https://bop.sd.gov/"),
        ("TN", "Tennessee", "https://tn.gov/generalservices/procurement/central-procurement-office--cpo-/solicitations.html"),
        ("TX", "Texas", "https://www.txsmartbuy.com/sp"),
        ("UT", "Utah", "https://purchasing.utah.gov/"),
        ("VT", "Vermont", "https://bgs.vermont.gov/purchasing-contracting"),
        ("VA", "Virginia", "https://eva.virginia.gov/"),
        ("WA", "Washington", "https://fortress.wa.gov/ga/webs/"),
        ("WV", "West Virginia", "https://state.wv.gov/admin/purchase/"),
        ("WI", "Wisconsin", "https://vendornet.wi.gov/"),
        ("WY", "Wyoming", "https://sites.google.com/wyo.gov/procurement/"),
        ("DC", "District of Columbia", "https://ocp.dc.gov/page/solicitations"),
        ("PR", "Puerto Rico", "https://www.asg.pr.gov/"),
        ("GU", "Guam", "https://www.guamopa.com/"),
        ("VI", "US Virgin Islands", "https://dpp.vi.gov/"),
        ("AS", "American Samoa", "https://www.americansamoa.gov/procurement"),
    ]

    total_saved = 0
    for state_code, state_name, url in PORTALS:
        use_puppeteer = state_code in JS_STATES
        # Use JS-specific URL if available
        actual_url = JS_STATE_URLS.get(state_code, url)

        log(f"  {state_code} ({state_name}): {'Puppeteer' if use_puppeteer else 'Direct'}...")
        saved = scrape_state_portal(state_code, state_name, actual_url, use_puppeteer)
        total_saved += saved
        log(f"  {state_code}: {saved} opportunities saved")
        delay(1)

    log(f"  ALL STATES COMPLETE: {total_saved} total saved")
    return total_saved


def scrape_federal_civilian():
    """Scrape all federal civilian agency portals."""
    log("=== FEDERAL CIVILIAN (25 agencies) ===")

    SOURCES = [
        ("gsa_ebuy", "GSA eBuy", "https://www.ebuy.gsa.gov/ebuy/", True),
        ("nasa_procurement", "NASA Procurement", "https://procurement.nasa.gov/", False),
        ("nih_nitaac", "NIH NITAAC", "https://nitaac.nih.gov/buy/opportunities", True),
        ("epa_contracts", "EPA Contracts", "https://www.epa.gov/contracts", False),
        ("doe_procurement", "DOE Procurement", "https://www.energy.gov/management/office-management/operational-management/procurement-and-acquisition", False),
        ("dot_osdbu", "DOT OSDBU", "https://www.transportation.gov/osdbu", False),
        ("hhs_contracts", "HHS Grants & Contracts", "https://www.hhs.gov/grants-contracts/index.html", False),
        ("doj_procurement", "DOJ Procurement", "https://www.justice.gov/jmd/procurement", False),
        ("doi_acquisition", "DOI Acquisition", "https://www.doi.gov/pam/acquisition", False),
        ("usda_procurement", "USDA Procurement", "https://www.dm.usda.gov/procurement/", False),
        ("commerce_oam", "Commerce OAM", "https://www.commerce.gov/oam", False),
        ("treasury_procurement", "Treasury Procurement", "https://home.treasury.gov/about/offices/management/procurement", False),
        ("ssa_contracts", "SSA Contracts", "https://www.ssa.gov/oag/contracts/", False),
        ("va_procurement", "VA Procurement", "https://www.va.gov/opal/nac/", False),
        ("dhs_procurement", "DHS Procurement", "https://www.dhs.gov/procurement-operations", False),
        ("state_procurement", "State Dept Procurement", "https://www.state.gov/key-topics-bureau-of-administration/procurement/", False),
        ("hud_cpo", "HUD CPO", "https://www.hud.gov/program_offices/cpo", False),
        ("ed_contracts", "Education Contracts", "https://www.ed.gov/fund/contract", False),
        ("dol_procurement", "Labor Procurement", "https://www.dol.gov/general/procurement", False),
        ("opm_procurement", "OPM Procurement", "https://www.opm.gov/about-us/doing-business-with-opm/", False),
        ("faa_contracting", "FAA Contracting", "https://faaco.faa.gov/", False),
        ("fema_procurement", "FEMA Procurement", "https://www.fema.gov/about/doing-business-with-fema", False),
        ("gsa_subcontracting", "GSA Subcontracting", "https://www.gsa.gov/small-business/subcontracting-opportunities/subcontracting-directory", False),
    ]

    total_saved = 0
    proc_kw = re.compile(r'bid|rfp|rfq|solicit|procurement|contract|award|opportunity|forecast|acquisition', re.I)

    for source_id, name, url, needs_js in SOURCES:
        log(f"  {name}...")
        try:
            # Fetch page
            if needs_js:
                html = fetch_with_puppeteer(url, wait_ms=5000)
            else:
                try:
                    html = fetch_html(url)
                except:
                    html = fetch_with_puppeteer(url, wait_ms=5000)

            if len(html) < 500 or "JavaScript is required" in html or "enable JavaScript" in html:
                try:
                    html = fetch_with_puppeteer(url, wait_ms=5000)
                except:
                    log(f"  {name}: BLOCKED (JS required, Puppeteer failed)")
                    continue

            # Follow pagination
            all_html = [html]
            current_url = url
            current_html = html

            while True:
                next_urls = find_pagination_urls(current_html, current_url)
                if not next_urls:
                    break
                next_url = next_urls[0]
                if next_url == current_url:
                    break
                try:
                    if needs_js:
                        page_html = fetch_with_puppeteer(next_url, wait_ms=3000)
                    else:
                        page_html = fetch_html(next_url)
                    if len(page_html) < 200:
                        break
                    all_html.append(page_html)
                    current_html = page_html
                    current_url = next_url
                    delay(2)
                except:
                    break

            records = []
            for page_html in all_html:
                for link in extract_links(page_html, url):
                    if proc_kw.search(link["text"]) or proc_kw.search(link["href"]):
                        nid = make_notice_id(f"fedciv-{source_id}", link["text"], link["href"])
                        records.append({
                            "notice_id": nid,
                            "title": f"[{name}] {link['text'][:200]}",
                            "agency": name,
                            "source": "federal_civilian",
                            "source_url": link["href"],
                            "description": link["text"],
                        })

                for row in extract_table_rows(page_html):
                    nid = make_notice_id(f"fedciv-{source_id}", row)
                    records.append({
                        "notice_id": nid,
                        "title": f"[{name}] {row[:200]}",
                        "agency": name,
                        "source": "federal_civilian",
                        "source_url": url,
                        "description": row[:2000],
                    })

            # Deduplicate
            seen = set()
            unique = []
            for r in records:
                if r["notice_id"] not in seen:
                    seen.add(r["notice_id"])
                    unique.append(r)

            saved = upsert_opportunities(unique)
            total_saved += saved
            log(f"  {name}: {saved} items across {len(all_html)} pages")

        except Exception as e:
            log(f"  {name}: ERROR - {e}")
            stats["errors"].append(f"fedciv_{source_id}: {e}")

        delay(1)

    log(f"  FEDERAL CIVILIAN COMPLETE: {total_saved} total saved")
    return total_saved


def scrape_military():
    """Scrape military/defense sources."""
    log("=== MILITARY/DEFENSE (14 sources) ===")

    SOURCES = [
        ("dla_dibbs", "DLA DIBBS", "https://www.dibbs.bsm.dla.mil/"),
        ("army_asfi", "Army ASFI", "https://acquisition.army.mil/asfi/"),
        ("army_acc", "Army Contracting Command", "https://acc.army.mil/contractingcenters/"),
        ("navy_neco", "Navy NECO", "https://www.neco.navy.mil/"),
        ("air_force", "Air Force Contracting", "https://www.afmc.af.mil/contracting/"),
        ("marines", "Marine Corps", "https://www.marcorsyscom.marines.mil/"),
        ("disa", "DISA Procurement", "https://www.disa.mil/About/Procurement"),
        ("darpa", "DARPA Contracts", "https://www.darpa.mil/work-with-us/contracting"),
        ("dha", "Defense Health Agency", "https://health.mil/About-MHS/OASDHA/Defense-Health-Agency/Procurement-and-Contracting"),
        ("mda", "Missile Defense Agency", "https://www.mda.mil/business/"),
        ("space_force", "Space Force", "https://www.spaceforce.mil/"),
        ("usace", "Army Corps of Engineers", "https://www.usace.army.mil/Business-With-Us/"),
        ("socom", "SOCOM", "https://www.socom.mil/SOF-ATL/Pages/default.aspx"),
        ("dcsa", "DCSA", "https://www.dcsa.mil/mc/pv/mbi/procurement/"),
    ]

    total_saved = 0
    proc_kw = re.compile(r'bid|rfp|rfq|solicit|procurement|contract|award|opportunity', re.I)

    for source_id, name, url in SOURCES:
        log(f"  {name}...")
        try:
            # Try direct first, then Puppeteer
            try:
                html = fetch_html(url, timeout=10)
            except:
                try:
                    html = fetch_with_puppeteer(url, wait_ms=5000)
                except Exception as e:
                    log(f"  {name}: BLOCKED ({e})")
                    continue

            if len(html) < 500:
                try:
                    html = fetch_with_puppeteer(url, wait_ms=5000)
                except:
                    log(f"  {name}: BLOCKED (minimal response)")
                    continue

            records = []
            for link in extract_links(html, url):
                if proc_kw.search(link["text"]) or proc_kw.search(link["href"]):
                    nid = make_notice_id(f"mil-{source_id}", link["text"], link["href"])
                    records.append({
                        "notice_id": nid,
                        "title": f"[{name}] {link['text'][:200]}",
                        "agency": name,
                        "source": "military_defense",
                        "source_url": link["href"],
                        "description": link["text"],
                    })

            for row in extract_table_rows(html):
                nid = make_notice_id(f"mil-{source_id}", row)
                records.append({
                    "notice_id": nid,
                    "title": f"[{name}] {row[:200]}",
                    "agency": name,
                    "source": "military_defense",
                    "source_url": url,
                    "description": row[:2000],
                })

            seen = set()
            unique = [r for r in records if r["notice_id"] not in seen and not seen.add(r["notice_id"])]

            saved = upsert_opportunities(unique)
            total_saved += saved
            log(f"  {name}: {saved} items")

        except Exception as e:
            log(f"  {name}: ERROR - {e}")

        delay(1)

    log(f"  MILITARY COMPLETE: {total_saved} total saved")
    return total_saved


def scrape_forecasts():
    """Scrape forecast sources + FPDS Atom feed."""
    log("=== FORECASTS ===")

    total_saved = 0

    # FPDS Atom Feed
    log("  FPDS Atom feed...")
    try:
        fpds_url = "https://www.fpds.gov/ezsearch/LATEST?s=FPDS&indexName=awardfull&q=&start=0&length=100"
        html = fetch_html(fpds_url, timeout=15)

        records = []
        for entry in re.finditer(r'<entry>([\s\S]*?)</entry>', html, re.I):
            content = entry.group(1)
            title_m = re.search(r'<title[^>]*>([\s\S]*?)</title>', content, re.I)
            link_m = re.search(r'<link[^>]+href="([^"]*)"', content, re.I)
            summary_m = re.search(r'<summary[^>]*>([\s\S]*?)</summary>', content, re.I)

            title = re.sub(r'<!\[CDATA\[|\]\]>', '', title_m.group(1)).strip() if title_m else "FPDS Award"
            link = link_m.group(1) if link_m else "https://www.fpds.gov"
            summary = re.sub(r'<!\[CDATA\[|\]\]>', '', summary_m.group(1)).strip() if summary_m else ""

            nid = make_notice_id("fpds-feed", title, link)
            records.append({
                "notice_id": nid,
                "title": f"[FPDS] {title[:200]}",
                "agency": "Federal Agency (FPDS)",
                "source": "fpds_feed",
                "source_url": link,
                "description": summary[:10000] or title,
            })

        saved = upsert_opportunities(records)
        total_saved += saved
        log(f"  FPDS feed: {saved} items")
    except Exception as e:
        log(f"  FPDS feed error: {e}")

    # GovTribe (needs Puppeteer)
    log("  GovTribe...")
    try:
        html = fetch_with_puppeteer("https://govtribe.com/opportunities", wait_ms=5000)
        proc_kw = re.compile(r'forecast|contract|award|solicit|bid|rfp|rfq|procurement|opportunity', re.I)
        records = []
        for link in extract_links(html, "https://govtribe.com"):
            if proc_kw.search(link["text"]) or proc_kw.search(link["href"]):
                nid = make_notice_id("forecast-govtribe", link["text"], link["href"])
                records.append({
                    "notice_id": nid,
                    "title": f"[GovTribe] {link['text'][:200]}",
                    "agency": "GovTribe",
                    "source": "forecasts",
                    "source_url": link["href"],
                    "description": link["text"],
                })
        saved = upsert_opportunities(records)
        total_saved += saved
        log(f"  GovTribe: {saved} items")
    except Exception as e:
        log(f"  GovTribe error: {e}")

    # SAM.gov Procurement Forecasts
    log("  SAM.gov Forecasts...")
    try:
        html = fetch_with_puppeteer("https://sam.gov/search?index=fpf", wait_ms=5000)
        records = []
        for link in extract_links(html, "https://sam.gov"):
            nid = make_notice_id("forecast-sam", link["text"], link["href"])
            records.append({
                "notice_id": nid,
                "title": f"[SAM Forecast] {link['text'][:200]}",
                "agency": "SAM.gov",
                "source": "forecasts",
                "source_url": link["href"],
                "description": link["text"],
            })
        saved = upsert_opportunities(records)
        total_saved += saved
        log(f"  SAM Forecasts: {saved} items")
    except Exception as e:
        log(f"  SAM Forecasts error: {e}")

    log(f"  FORECASTS COMPLETE: {total_saved} total saved")
    return total_saved


def scrape_subcontracting():
    """Scrape subcontracting sources."""
    log("=== SUBCONTRACTING ===")

    SOURCES = [
        ("sba_subnet", "SBA SubNet", "https://eweb.sba.gov/subnet/"),
        ("gsa_subcontracting", "GSA Subcontracting Directory", "https://www.gsa.gov/small-business/subcontracting-opportunities/subcontracting-directory"),
    ]

    total_saved = 0
    sub_kw = re.compile(r'subcontract|bid|solicit|rfp|rfq|procurement|opportunity|contract|award|small.?business', re.I)

    for source_id, name, url in SOURCES:
        log(f"  {name}...")
        try:
            try:
                html = fetch_html(url)
            except:
                html = fetch_with_puppeteer(url, wait_ms=5000)

            if len(html) < 500:
                try:
                    html = fetch_with_puppeteer(url, wait_ms=5000)
                except:
                    continue

            records = []
            for link in extract_links(html, url):
                if sub_kw.search(link["text"]) or sub_kw.search(link["href"]):
                    nid = make_notice_id(f"sub-{source_id}", link["text"], link["href"])
                    records.append({
                        "notice_id": nid,
                        "title": f"[{name}] {link['text'][:200]}",
                        "agency": name,
                        "source": "subcontracting",
                        "source_url": link["href"],
                        "description": link["text"],
                    })

            for row in extract_table_rows(html):
                nid = make_notice_id(f"sub-{source_id}", row)
                records.append({
                    "notice_id": nid,
                    "title": f"[{name}] {row[:200]}",
                    "agency": name,
                    "source": "subcontracting",
                    "source_url": url,
                    "description": row[:2000],
                })

            seen = set()
            unique = [r for r in records if r["notice_id"] not in seen and not seen.add(r["notice_id"])]
            saved = upsert_opportunities(unique)
            total_saved += saved
            log(f"  {name}: {saved} items")
        except Exception as e:
            log(f"  {name}: ERROR - {e}")

        delay(1)

    log(f"  SUBCONTRACTING COMPLETE: {total_saved} total saved")
    return total_saved


def scrape_sbir_html():
    """Scrape SBIR agency HTML sources (beyond the API)."""
    log("=== SBIR AGENCY HTML SOURCES ===")

    SOURCES = [
        ("sbir_dod", "DoD SBIR", "https://www.dodsbirsttr.mil/submissions/", True),
        ("sbir_nih", "NIH SBIR", "https://seed.nih.gov/", False),
        ("sbir_nsf", "NSF SBIR", "https://seedfund.nsf.gov/", False),
        ("sbir_doe", "DOE SBIR", "https://science.osti.gov/sbir", False),
        ("sbir_nasa", "NASA SBIR", "https://sbir.nasa.gov/", False),
        ("sbir_usda", "USDA SBIR", "https://www.nifa.usda.gov/grants/programs/sbir-program", False),
    ]

    total_saved = 0
    sbir_kw = re.compile(r'sbir|sttr|solicit|topic|fund|grant|award|proposal', re.I)

    for source_id, name, url, needs_js in SOURCES:
        log(f"  {name}...")
        try:
            if needs_js:
                html = fetch_with_puppeteer(url, wait_ms=5000)
            else:
                try:
                    html = fetch_html(url)
                except:
                    html = fetch_with_puppeteer(url, wait_ms=5000)

            if len(html) < 500:
                try:
                    html = fetch_with_puppeteer(url, wait_ms=5000)
                except:
                    continue

            records = []
            for link in extract_links(html, url):
                if sbir_kw.search(link["text"]) or sbir_kw.search(link["href"]):
                    nid = make_notice_id(source_id, link["text"], link["href"])
                    records.append({
                        "notice_id": nid,
                        "title": f"[{name}] {link['text'][:200]}",
                        "agency": name,
                        "source": "sbir_sttr",
                        "source_url": link["href"],
                        "description": link["text"],
                    })

            seen = set()
            unique = [r for r in records if r["notice_id"] not in seen and not seen.add(r["notice_id"])]
            saved = upsert_opportunities(unique)
            total_saved += saved
            log(f"  {name}: {saved} items")
        except Exception as e:
            log(f"  {name}: ERROR - {e}")

        delay(1)

    log(f"  SBIR HTML COMPLETE: {total_saved} total saved")
    return total_saved


# ============================================================
# MAIN
# ============================================================
def main():
    log("=" * 60)
    log("CONTRACTSINTEL FULL BACKFILL — STARTING")
    log("=" * 60)

    results = {}

    # 1. API-based sources (highest volume)
    results["usaspending"] = scrape_usaspending()
    results["grants_gov"] = scrape_grants_gov()
    results["sam_gov"] = scrape_sam_gov()
    results["sbir_api"] = scrape_sbir_api()

    # 2. HTML-based sources
    results["states"] = scrape_all_states()
    results["federal_civilian"] = scrape_federal_civilian()
    results["military"] = scrape_military()
    results["forecasts"] = scrape_forecasts()
    results["subcontracting"] = scrape_subcontracting()
    results["sbir_html"] = scrape_sbir_html()

    # Summary
    log("=" * 60)
    log("BACKFILL COMPLETE — RESULTS")
    log("=" * 60)
    for source, count in results.items():
        log(f"  {source}: {count}")
    log(f"  TOTAL NEW UPSERTED: {stats['total_upserted']}")

    if stats["errors"]:
        log(f"\n  ERRORS ({len(stats['errors'])}):")
        for err in stats["errors"][:20]:
            log(f"    - {err}")

    log("=" * 60)


if __name__ == "__main__":
    main()
