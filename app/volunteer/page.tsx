"use client";

import { useState } from "react";

import {
  Dash,
  ListStates,
  PageHeader,
  StatusBadge,
  TableHead,
  TableShell,
  useVolunteerFetch,
  useVolunteerPost,
} from "./_ui";
import { TokenQrCode } from "@/components/donor/TokenQrCode";

/** A token currently held by this volunteer, awaiting distribution. */
interface HeldToken {
  token_id: string;
  serial_number: string;
  token_type: string;
  value: number;
  status: string;
  minted_at: string;
  // Derived one-time QR payload — what the volunteer SHOWS the beneficiary so it
  // can be scanned at a vendor. Without this the held token is a dead-end.
  qr_payload: string;
}

/** A token-allocation request this volunteer has submitted. */
interface VolunteerRequest {
  id: string;
  requested_count: number;
  decided_count: number | null;
  status: string;
  created_at: string;
}

/** This volunteer's concurrent-holding headroom (max_tokens_per_volunteer). */
interface Allocation {
  limit: number | null;
  held_count: number;
  remaining: number | null;
}

/**
 * Volunteer dashboard (Path B). Sections: tokens held & a distribute control,
 * a request-tokens form (with concurrent-limit headroom), and the volunteer's
 * own request history. Each section drives its own fetch state; mutations reload
 * the affected lists on success.
 */
export default function VolunteerDashboardPage() {
  // GET /api/volunteer/tokens → { tokens: HeldToken[], total }
  const tokens = useVolunteerFetch<HeldToken[]>("/api/volunteer/tokens", "tokens", "/volunteer");
  // GET /api/volunteer/requests → { requests: VolunteerRequest[], total }
  const requests = useVolunteerFetch<VolunteerRequest[]>(
    "/api/volunteer/requests",
    "requests",
    "/volunteer"
  );
  // GET /api/volunteer/allocation → { allocation: Allocation }
  const allocation = useVolunteerFetch<Allocation>(
    "/api/volunteer/allocation",
    "allocation",
    "/volunteer"
  );
  // GET /api/volunteer/tokens also returns { distributed } — tokens this
  // volunteer has handed off, kept viewable so the QR can be re-shown.
  const distributed = useVolunteerFetch<HeldToken[]>(
    "/api/volunteer/tokens",
    "distributed",
    "/volunteer"
  );

  const tokenList = tokens.data ?? [];
  const requestList = requests.data ?? [];
  const distributedList = distributed.data ?? [];

  // Distributing changes the held set, the held-count headroom, AND moves the
  // token into the distributed list — reload all three.
  async function reloadAfterDistribute() {
    await Promise.all([tokens.reload(), allocation.reload(), distributed.reload()]);
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Volunteer dashboard"
        subtitle="Hold tokens, distribute them to beneficiaries, and request more from the admin."
      />

      <HeldTokensSection
        state={tokens.state}
        errorMsg={tokens.errorMsg}
        tokens={tokenList}
        reload={reloadAfterDistribute}
      />

      <RequestTokensSection
        allocation={allocation.data}
        onRequested={requests.reload}
      />

      <MyRequestsSection
        state={requests.state}
        errorMsg={requests.errorMsg}
        requests={requestList}
      />

      <DistributedSection
        state={distributed.state}
        errorMsg={distributed.errorMsg}
        tokens={distributedList}
      />
    </div>
  );
}

/* ── Section a: held tokens + distribute ───────────────────────────────────── */

function HeldTokensSection({
  state,
  errorMsg,
  tokens,
  reload,
}: {
  state: ReturnType<typeof useVolunteerFetch>["state"];
  errorMsg: string | null;
  tokens: HeldToken[];
  reload: () => Promise<void>;
}) {
  return (
    <section>
      <SectionHeader
        title="Held tokens"
        subtitle="Tokens assigned to you, ready to distribute to beneficiaries."
        count={state === "ready" ? tokens.length : undefined}
      />
      <ListStates
        state={state}
        errorMsg={errorMsg}
        isEmpty={tokens.length === 0}
        resourceLabel="held tokens"
        emptyHint="Tokens granted to you will appear here once the admin approves a request."
      >
        <TableShell>
          <TableHead columns={["Serial", "Type", "Value", "Status", "Minted", "Action"]} />
          <tbody className="divide-y divide-slate-100">
            {tokens.map((t) => (
              <DistributeRow key={t.token_id} token={t} reload={reload} />
            ))}
          </tbody>
        </TableShell>
      </ListStates>
    </section>
  );
}

/** A single held-token row with an inline distribute form. */
function DistributeRow({ token, reload }: { token: HeldToken; reload: () => Promise<void> }) {
  const { post } = useVolunteerPost();
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function distribute(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (location.trim()) body.distribution_location = location.trim();
      await post(`/api/volunteer/tokens/${token.token_id}/distribute`, body);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to distribute token.");
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-3 font-mono text-xs text-slate-700">{token.serial_number}</td>
        <td className="px-4 py-3 capitalize text-slate-700">
          {token.token_type.replace(/_/g, " ")}
        </td>
        <td className="px-4 py-3 font-medium text-slate-900">
          ₹{token.value.toLocaleString("en-IN")}
        </td>
        <td className="px-4 py-3">
          <StatusBadge value={token.status} />
        </td>
        <td className="px-4 py-3 text-slate-500">
          {new Date(token.minted_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={busy}
            className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 transition hover:bg-green-100 disabled:opacity-50"
          >
            {open ? "Cancel" : "Distribute"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50/60">
          <td colSpan={6} className="px-4 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {/* The actual hand-off: show the one-time QR so the beneficiary can
                  scan or save it to redeem at a vendor. */}
              <div className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-3">
                <TokenQrCode payload={token.qr_payload} size={150} />
                <span className="font-mono text-[10px] text-slate-500">{token.serial_number}</span>
                <span className="text-xs font-semibold text-slate-700">
                  ₹{token.value.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-700">
                  Show this QR to the beneficiary
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  They scan or keep it to redeem at an approved vendor. Then mark it distributed —
                  it stays viewable below under “Distributed by you”.
                </p>
                <form onSubmit={distribute} className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Distribution location (optional)
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. Relief camp 3"
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 sm:w-56"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                  >
                    {busy ? "Distributing…" : "Mark as distributed"}
                  </button>
                  {error && <span className="text-xs font-medium text-red-700">{error}</span>}
                </form>
                <p className="mt-2 text-xs text-slate-400">
                  Face verification happens when the beneficiary redeems the token at a vendor — not
                  at distribution.
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Section d: distributed tokens (QR stays re-showable) ──────────────────── */

function DistributedSection({
  state,
  errorMsg,
  tokens,
}: {
  state: ReturnType<typeof useVolunteerFetch>["state"];
  errorMsg: string | null;
  tokens: HeldToken[];
}) {
  return (
    <section>
      <SectionHeader
        title="Distributed by you"
        subtitle="Tokens you've handed off. Re-show the QR if a beneficiary needs it again."
        count={state === "ready" ? tokens.length : undefined}
      />
      <ListStates
        state={state}
        errorMsg={errorMsg}
        isEmpty={tokens.length === 0}
        resourceLabel="distributed tokens"
        emptyHint="Tokens you distribute will appear here, with the QR still viewable."
      >
        <TableShell>
          <TableHead columns={["Serial", "Type", "Value", "Status", "Action"]} />
          <tbody className="divide-y divide-slate-100">
            {tokens.map((t) => (
              <DistributedRow key={t.token_id} token={t} />
            ))}
          </tbody>
        </TableShell>
      </ListStates>
    </section>
  );
}

/** A distributed-token row that can re-show its QR (the beneficiary's copy). */
function DistributedRow({ token }: { token: HeldToken }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-3 font-mono text-xs text-slate-700">{token.serial_number}</td>
        <td className="px-4 py-3 capitalize text-slate-700">
          {token.token_type.replace(/_/g, " ")}
        </td>
        <td className="px-4 py-3 font-medium text-slate-900">
          ₹{token.value.toLocaleString("en-IN")}
        </td>
        <td className="px-4 py-3">
          <StatusBadge value={token.status} />
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {show ? "Hide QR" : "Show QR"}
          </button>
        </td>
      </tr>
      {show && (
        <tr className="bg-slate-50/60">
          <td colSpan={5} className="px-4 py-4">
            <div className="flex flex-col items-center gap-1.5">
              <TokenQrCode payload={token.qr_payload} size={150} />
              <span className="font-mono text-[10px] text-slate-500">{token.serial_number}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Section b: request more tokens ────────────────────────────────────────── */

function RequestTokensSection({
  allocation,
  onRequested,
}: {
  allocation: Allocation | null;
  onRequested: () => Promise<void>;
}) {
  const { post } = useVolunteerPost();
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(count);
    if (!Number.isInteger(n) || n <= 0) {
      setError("Enter a whole number of tokens greater than zero.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await post<{ request_id: string; status: string }>("/api/volunteer/requests", {
        requested_count: n,
      });
      setMsg(`Requested ${n} token(s). The admin will review your request.`);
      setCount("");
      await onRequested();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionHeader
        title="Request tokens"
        subtitle="Ask the admin to allocate more tokens for you to distribute."
      />
      <form
        onSubmit={submit}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Number of tokens
          <input
            type="number"
            min={1}
            step={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="e.g. 25"
            className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {busy ? "Requesting…" : "Request"}
        </button>
        {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
        {error && <span className="text-xs font-medium text-red-700">{error}</span>}
      </form>
      <AllocationHint allocation={allocation} />
    </section>
  );
}

/** Concurrent-limit headroom line. Never invents a number when the limit is unset. */
function AllocationHint({ allocation }: { allocation: Allocation | null }) {
  if (!allocation) return null;
  const { limit, held_count, remaining } = allocation;
  if (limit == null) {
    return (
      <p className="mt-2 text-xs text-slate-500">
        You currently hold {held_count} token(s). No holding limit is set.
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs text-slate-500">
      You hold {held_count} of {limit} token(s){" "}
      {remaining === 0 ? (
        <span className="font-medium text-amber-700">— at your limit; distribute some first.</span>
      ) : (
        <span>— you can hold {remaining} more.</span>
      )}
    </p>
  );
}

/* ── Section c: my requests ────────────────────────────────────────────────── */

function MyRequestsSection({
  state,
  errorMsg,
  requests,
}: {
  state: ReturnType<typeof useVolunteerFetch>["state"];
  errorMsg: string | null;
  requests: VolunteerRequest[];
}) {
  return (
    <section>
      <SectionHeader
        title="My requests"
        subtitle="The status of each token-allocation request you have submitted."
        count={state === "ready" ? requests.length : undefined}
      />
      <ListStates
        state={state}
        errorMsg={errorMsg}
        isEmpty={requests.length === 0}
        resourceLabel="requests"
        emptyHint="Submit a request above and it will show up here with its status."
      >
        <TableShell>
          <TableHead columns={["Requested", "Granted", "Status", "Submitted"]} />
          <tbody className="divide-y divide-slate-100">
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{r.requested_count}</td>
                <td className="px-4 py-3 text-slate-700">
                  <Dash>{r.decided_count != null ? r.decided_count : null}</Dash>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge value={r.status} />
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </ListStates>
    </section>
  );
}

/* ── shared ───────────────────────────────────────────────────────────────── */

function SectionHeader({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle: string;
  count?: number;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
      </div>
      {count != null && <span className="text-sm text-slate-400">{count} total</span>}
    </div>
  );
}
