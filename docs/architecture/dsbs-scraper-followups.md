# DSBS Scraper — Post-Launch Follow-Ups

**Status:** Deferred. Do NOT start before **2026-05-04** (HUBZone launch gate).

## Context

PR #20 (merged as `94123ce`) loaded **60,436 DSBS leads** to prod on 2026-04-24.
A client-side-split hotfix landed in `f80b1f7` to work around a partial-unique-index
limitation in PostgREST upserts. The scraper is working great, but the items
below are polish/cleanup that were intentionally deferred to keep the
**May 4 HUBZone launch** on track.

---

## 1. Proper upsert fix (schema change)

**Problem:** `puppeteer-server/scripts/dsbs-full-universe.js` currently does a
client-side split insert/update inside `upsertBatch()` because PostgREST cannot
target the partial unique index `leads_dedup_key_uniq`
(`WHERE dedup_key IS NOT NULL`).

**Fix:**

1. Verify there are no null dedup_keys:
   ```sql
   SELECT COUNT(*) FROM leads WHERE dedup_key IS NULL;
   ```
2. Migration:
   ```sql
   ALTER TABLE leads ALTER COLUMN dedup_key SET NOT NULL;
   DROP INDEX leads_dedup_key_uniq;
   CREATE UNIQUE INDEX leads_dedup_key_uniq ON leads(dedup_key);
   ```
3. Revert the scraper's `upsertBatch()` back to
   `.upsert({ onConflict: 'dedup_key' })`. PostgREST will now be able to target
   the plain unique index.

**Why it matters:** currently blocks the weekly delta refresh (item 5) because
existing rows would need UPDATE via the slower client-side pool
(**~50 min for full 60K** vs **~1 min native upsert**).

---

## 2. Rich DSBS fields migration

Add the following columns to `leads`:

| Column                   | Type      |
|--------------------------|-----------|
| `capabilities_narrative` | `text`    |
| `county`                 | `text`    |
| `year_established`       | `int`     |
| `business_size`          | `text`    |
| `keywords`               | `text[]`  |
| `raw_data`               | `jsonb`   |

Then re-run the scraper with those fields populated.

**Drop `annual_revenue` from the plan** — SBS response always returns null for it.

Useful for personalization and contract-matching.

---

## 3. Geocoder-error sanitizer

The SBS `county` field occasionally contains a literal ArcGIS 503 error string
starting with `"Geocoding service error:"`.

When we add the `county` column (item 2), the mapper must null-out values matching:

```
/^Geocoding service error/
```

**Confirmed example:** ANGEL ADVANCED TECHNOLOGIES, LLC (UEI `WNM3MKEKT1Y6`).

---

## 4. `additional_website` sanitizer

SBS occasionally stuffs an email into `additional_website` (observed:
`"Https://info@a2-federal.com"` on UEI `HYGENB7M2T76`).

When using this field, validate as a URL; reject/null if it doesn't parse as one.

---

## 5. Weekly delta cron

Schedule: **Sundays 04:00 UTC**.

**Blocked by item 1** — native upsert is required for reasonable performance.

---

## 6. EDWOSB-primary edge cases (16 firms)

16 firms have `active_edwosb_boolean` but no `active_wosb_boolean`. This is
legally impossible per **13 CFR 127.200** (EDWOSB is a subset of WOSB), so
they're almost certainly SBS data bugs.

**Low-priority cleanup:** either manually set `primary_cert='wosb'` or leave as-is.

List of 16 UEIs: `/tmp/dsbs-spotcheck.log` from the 2026-04-24 spot-check.
