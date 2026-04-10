"use client";

// G28: API key management page. Lists existing keys (name, prefix, created,
// last used, status), lets the user issue a new key (raw secret shown ONCE),
// and revoke existing ones.

import { useEffect, useState } from "react";
import Link from "next/link";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/api-keys");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed to load");
      setKeys(j.api_keys ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed to create");
      setNewKey(j.api_key.raw_key);
      setName("");
      load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this API key? Any clients still using it will start receiving 401 errors.")) return;
    try {
      const r = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to revoke");
      }
      load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to revoke key");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="ci-page-title">API Keys</h1>
        <Link href="/dashboard/settings" className="text-xs text-[#3b82f6] hover:underline">
          ← Back to Settings
        </Link>
      </div>

      <p className="text-sm text-[#64748b] mb-6 max-w-2xl">
        Issue keys to integrate ContractsIntel with external tools. Pass the key as
        <code className="mx-1 px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a] font-mono text-xs">Authorization: Bearer …</code>
        when calling <code className="mx-1 px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a] font-mono text-xs">/api/v1/opportunities</code>,
        <code className="mx-1 px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a] font-mono text-xs">/api/v1/opportunities/[id]</code>, and
        <code className="mx-1 px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a] font-mono text-xs">/api/v1/matches</code>.
        Keys are read-only, scoped to your organization, and shown only once at creation.
      </p>

      {newKey && (
        <div className="mb-6 border border-[#fcd34d] bg-[#fffbeb] rounded-xl p-4">
          <div className="text-xs font-semibold text-[#92400e] uppercase tracking-wide mb-2">
            New API key — copy it now
          </div>
          <div className="font-mono text-xs text-[#0f172a] bg-white border border-[#e5e7eb] rounded p-3 break-all">
            {newKey}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(newKey);
              }}
              className="text-xs px-3 py-1.5 bg-[#2563eb] text-white rounded hover:bg-[#1d4ed8]"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setNewKey(null)}
              className="text-xs text-[#64748b] hover:text-[#0f172a]"
            >
              Dismiss
            </button>
          </div>
          <p className="text-[11px] text-[#92400e] mt-2">
            We won&apos;t show this again. Store it in your secrets manager now.
          </p>
        </div>
      )}

      <form onSubmit={create} className="mb-6 border border-[#e5e7eb] bg-white rounded-xl p-4 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-[#64748b] mb-1 font-medium uppercase tracking-wide">
            Key name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Zapier integration"
            className="w-full bg-[#f8f9fb] border border-[#e5e7eb] text-[#0f172a] px-3 py-2 text-sm rounded-lg focus:outline-none focus:border-[#2563eb]"
          />
        </div>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="px-4 py-2 text-sm bg-[#2563eb] text-white rounded-lg hover:bg-[#1d4ed8] disabled:opacity-50"
        >
          {creating ? "Creating…" : "Issue key"}
        </button>
      </form>

      {error && <div className="mb-4 text-xs text-[#dc2626]">{error}</div>}

      {loading ? (
        <div className="text-center text-[#94a3b8] py-12 text-sm">Loading…</div>
      ) : keys.length === 0 ? (
        <div className="border border-[#e5e7eb] bg-white rounded-xl p-12 text-center">
          <div className="text-[#94a3b8] text-sm">No API keys yet</div>
        </div>
      ) : (
        <div className="border border-[#e5e7eb] bg-white rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-[#f8f9fb] text-[11px] uppercase tracking-wide text-[#64748b]">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Prefix</th>
                  <th className="text-left px-4 py-2 font-medium">Created</th>
                  <th className="text-left px-4 py-2 font-medium">Last used</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-t border-[#e5e7eb]">
                    <td className="px-4 py-2 text-[#0f172a]">{k.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-[#64748b]">{k.prefix}…</td>
                    <td className="px-4 py-2 text-xs text-[#64748b]">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-xs text-[#64748b]">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {k.revoked_at ? (
                        <span className="px-2 py-0.5 rounded bg-[#fef2f2] text-[#dc2626]">Revoked</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-[#ecfdf5] text-[#059669]">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!k.revoked_at && (
                        <button
                          type="button"
                          onClick={() => revoke(k.id)}
                          className="text-xs text-[#dc2626] hover:underline"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
