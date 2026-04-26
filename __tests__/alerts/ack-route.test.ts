/**
 * Tests for app/api/alerts/ack/route.ts.
 *
 * Verifies parameter parsing, HMAC verification, expiry, and idempotent
 * UPDATE-with-WHERE-acked_at-IS-NULL semantics.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "anon-test";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "svc-test";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "sk-test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_x";
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test";
process.env.CRON_SECRET = process.env.CRON_SECRET || "test-cron-secret";
process.env.ALERT_ACK_SECRET = "test-ack-secret-do-not-use-in-prod";

import { signAck } from "../../lib/alerts/sign";

// We mock supabase before route import so the in-memory client is used.
const acked = new Set<number>(); // ids already acked in our fake store
const present = new Set<number>([41, 42, 43]); // ids that exist in our fake store

const supabaseMock = {
  from(table: string) {
    if (table !== "cron_alerts") {
      return {
        update: () => ({ in: () => ({ is: () => ({ select: async () => ({ data: [], error: null }) }) }) }),
      };
    }
    return {
      update(_patch: Record<string, unknown>) {
        return {
          in(_col: string, ids: number[]) {
            return {
              is(_col2: string, _val: unknown) {
                return {
                  async select() {
                    const updated = ids.filter((id) => present.has(id) && !acked.has(id));
                    for (const id of updated) acked.add(id);
                    return { data: updated.map((id) => ({ id })), error: null };
                  },
                };
              },
            };
          },
        };
      },
    };
  },
};

// Intercept @supabase/supabase-js createClient via the require cache so
// pipelineSupabase() returns our in-memory mock instead of a network client.
// Must run BEFORE importing the route module.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseLib = require("@supabase/supabase-js");
supabaseLib.createClient = () => supabaseMock as any;

import { GET } from "../../app/api/alerts/ack/route";

function req(url: string): any {
  return { url, headers: { get: () => null } };
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

const RUN = "abcd1234";

test("missing params → 400", async () => {
  const res = await GET(req("https://x/api/alerts/ack"));
  assert.equal(res.status, 400);
});

test("non-numeric id → 400", async () => {
  const res = await GET(req("https://x/api/alerts/ack?id=abc&ts=1&r=abcd1234&sig=00"));
  assert.equal(res.status, 400);
});

test("invalid r format → 400", async () => {
  const ts = nowSec();
  const res = await GET(req(`https://x/api/alerts/ack?id=41&ts=${ts}&r=zz&sig=00`));
  assert.equal(res.status, 400);
});

test("expired ts → 410", async () => {
  const ts = nowSec() - 8 * 86400;
  const sig = signAck([41], ts, RUN);
  const res = await GET(req(`https://x/api/alerts/ack?id=41&ts=${ts}&r=${RUN}&sig=${sig}`));
  assert.equal(res.status, 410);
});

test("bad sig (correct length) → 400", async () => {
  const ts = nowSec();
  const sig = signAck([41], ts, RUN);
  const flipped = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a");
  const res = await GET(req(`https://x/api/alerts/ack?id=41&ts=${ts}&r=${RUN}&sig=${flipped}`));
  assert.equal(res.status, 400);
});

test("valid sig acks fresh alert → 200", async () => {
  const ts = nowSec();
  const sig = signAck([41], ts, RUN);
  const res = await GET(req(`https://x/api/alerts/ack?id=41&ts=${ts}&r=${RUN}&sig=${sig}`));
  assert.equal(res.status, 200);
  assert.equal(acked.has(41), true);
  const body = await res.text();
  assert.match(body, /acknowledged/);
  assert.match(body, /#41/);
});

test("re-ack of already-acked alert → 200 (idempotent, 0 rows updated)", async () => {
  // 41 is already in acked from prev test
  const ts = nowSec();
  const sig = signAck([41], ts, RUN);
  const res = await GET(req(`https://x/api/alerts/ack?id=41&ts=${ts}&r=${RUN}&sig=${sig}`));
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Already acknowledged/);
});

test("non-existent id → 200, marked already-acked-or-missing", async () => {
  const ts = nowSec();
  const sig = signAck([99999], ts, RUN);
  const res = await GET(req(`https://x/api/alerts/ack?id=99999&ts=${ts}&r=${RUN}&sig=${sig}`));
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Already acknowledged/);
});

test("batch ack with 3 ids: partial when one already acked", async () => {
  // 41 is acked already. 42 and 43 still pending.
  const ts = nowSec();
  const ids = [41, 42, 43];
  const sig = signAck(ids, ts, RUN);
  const res = await GET(req(`https://x/api/alerts/ack?ids=41,42,43&ts=${ts}&r=${RUN}&sig=${sig}`));
  assert.equal(res.status, 200);
  assert.equal(acked.has(42), true);
  assert.equal(acked.has(43), true);
  const body = await res.text();
  assert.match(body, /2 of 3 updated/);
});
