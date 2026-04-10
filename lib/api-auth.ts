import crypto from "crypto";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

// G28: Bearer-key auth for the public REST API.
//
// Keys are issued by the dashboard, hashed with SHA-256, and stored in
// `org_api_keys`. The hash is the only thing the database ever sees; we
// re-hash the inbound `Authorization: Bearer <key>` header and look it up.

export type ApiKeyContext = {
  apiKeyId: string;
  organizationId: string;
  scopes: string[];
};

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey(): { rawKey: string; prefix: string; hashed: string } {
  const random = crypto.randomBytes(32).toString("base64url");
  const rawKey = `ci_live_${random}`;
  const hashed = hashApiKey(rawKey);
  // First 12 chars (e.g. "ci_live_AbCd") form the user-visible prefix so the
  // dashboard can show "ci_live_AbCd…" without exposing the secret.
  const prefix = rawKey.slice(0, 12);
  return { rawKey, prefix, hashed };
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Supabase service-role env vars not configured");
  }
  return createServiceClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticateApiKey(
  request: NextRequest,
): Promise<{ ok: true; ctx: ApiKeyContext } | { ok: false; status: number; error: string }> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }
  const rawKey = header.slice(7).trim();
  if (!rawKey) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }
  const hashed = hashApiKey(rawKey);

  // Bypass RLS for the auth lookup — the bearer key itself is the credential.
  const admin = serviceClient();
  // PostgREST column projection with explicit `revoked_at` was returning
  // null even when the column had a value (suspected schema-cache quirk after
  // creating the table mid-session). `select("*")` consistently returns the
  // real value and the row is tiny so the extra columns are negligible.
  const { data, error } = await admin
    .from("org_api_keys")
    .select("*")
    .eq("hashed_key", hashed)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, status: 401, error: "Invalid API key" };
  }
  if (data.revoked_at) {
    return { ok: false, status: 401, error: "API key revoked" };
  }

  // Best-effort last_used_at update — never fail the request on this.
  admin
    .from("org_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => undefined, () => undefined);

  return {
    ok: true,
    ctx: {
      apiKeyId: data.id,
      organizationId: data.organization_id,
      scopes: data.scopes ?? ["read"],
    },
  };
}

export function publicClient() {
  // Service-role client used by /api/v1/* routes after the bearer token has
  // already been validated. RLS is bypassed; we manually scope queries to
  // the resolved `organizationId` from the api key context.
  return serviceClient();
}
