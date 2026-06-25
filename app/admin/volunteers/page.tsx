"use client";

import { useCallback, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { VolunteerResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    ListStates,
    Notice,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useRowAction,
} from "../_ui";

/** Admin volunteers page — registry of volunteers who hold/distribute tokens (Path B). */
export default function AdminVolunteersPage() {
    const canManage = useCan("token_distribution", "update");
    const canCreate = useCan("token_distribution", "create");
    const { items, state, errorMsg, reload } = useAdminList<VolunteerResponse>(
        "/api/admin/volunteers",
        "volunteers",
        "/admin/volunteers"
    );
    const { run, busyId, actionError } = useRowAction("/api/admin/volunteers", reload);
    const { allocate, busyId: allocBusyId, actionError: allocError } = useAllocate(reload);

    const columns = ["Name", "Email", "Phone", "Status", "Joined"];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Volunteers"
                subtitle="Volunteers who receive, hold and distribute tokens to beneficiaries."
                count={state === "ready" ? items.length : undefined}
            />

            {canCreate && (
                <div className="mb-6">
                    <AddVolunteerForm onCreated={reload} />
                </div>
            )}

            {actionError && (
                <div className="mb-4">
                    <Notice tone="error" title="Action failed">
                        {actionError}
                    </Notice>
                </div>
            )}

            {allocError && (
                <div className="mb-4">
                    <Notice tone="error" title="Allocation failed">
                        {allocError}
                    </Notice>
                </div>
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="volunteers"
                emptyHint="Volunteers will appear here once they are registered."
                table={
                    <TableShell>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((v) => (
                                <tr key={v.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        <Dash>{v.full_name}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{v.email}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{v.phone}</Dash>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={v.status} />
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {new Date(v.created_at).toLocaleDateString()}
                                    </td>
                                    {canManage && (
                                        <td className="px-4 py-3">
                                            <VolunteerActions
                                                id={v.id}
                                                status={v.status}
                                                busy={busyId === v.id}
                                                run={run}
                                                allocate={allocate}
                                                allocBusy={allocBusyId === v.id}
                                            />
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />

            <div className="mt-10">
                <VolunteerRequestsSection canManage={canManage} />
            </div>
        </div>
    );
}

/**
 * Admin "Add volunteer" form — collapsible. POSTs to /api/admin/volunteers, which
 * creates the auth user, flips the role to 'volunteer', and inserts the linked
 * profile (active). On success the registry reloads and the form resets. This is
 * the onboarding seam that makes a working volunteer account exist end-to-end.
 */
function AddVolunteerForm({ onCreated }: { onCreated: () => Promise<void> }) {
    const [open, setOpen] = useState(false);
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

    function reset() {
        setFullName("");
        setEmail("");
        setPhone("");
        setPassword("");
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!fullName.trim() || !email.trim() || password.length < 6) {
            setError("Name, email, and a password of at least 6 characters are required.");
            return;
        }
        setBusy(true);
        setError(null);
        setMsg(null);
        try {
            const res = await fetch("/api/admin/volunteers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    full_name: fullName.trim(),
                    email: email.trim(),
                    password,
                    phone: phone.trim() || undefined,
                }),
            });
            if (res.status === 401) {
                window.location.href = "/login?redirect=/admin/volunteers";
                return;
            }
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error ?? `Could not create volunteer (${res.status}).`);
                return;
            }
            setMsg(`Volunteer '${fullName.trim()}' created. They can sign in at /volunteer/login.`);
            reset();
            await onCreated();
        } catch {
            setError("Network error — please try again.");
        } finally {
            setBusy(false);
        }
    }

    if (!open) {
        return (
            <ActionButton tone="primary" disabled={false} onClick={() => setOpen(true)}>
                Add volunteer
            </ActionButton>
        );
    }

    return (
        <form
            onSubmit={submit}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Add a volunteer</h2>
                <ActionButton
                    tone="neutral"
                    disabled={busy}
                    onClick={() => {
                        setOpen(false);
                        setError(null);
                        setMsg(null);
                    }}
                >
                    Cancel
                </ActionButton>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Full name
                    <input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Email
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="off"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Phone (optional)
                    <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Temporary password
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="at least 6 characters"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                    />
                </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                    {busy ? "Creating…" : "Create volunteer"}
                </button>
                {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
                {error && <span className="text-xs font-medium text-red-700">{error}</span>}
            </div>
            <p className="mt-2 text-xs text-slate-400">
                Share the email and temporary password with the volunteer — they sign in at
                /volunteer/login and can hold, distribute, and request tokens.
            </p>
        </form>
    );
}

function VolunteerActions({
    id,
    status,
    busy,
    run,
    allocate,
    allocBusy,
}: {
    id: string;
    status: VolunteerResponse["status"];
    busy: boolean;
    run: (rowId: string, payload: Record<string, unknown>, confirmText?: string) => void;
    allocate: (id: string, count: number) => void;
    allocBusy: boolean;
}) {
    const act = (action: string, confirmText?: string) =>
        run(id, { volunteer_id: id, action }, confirmText);

    const [allocating, setAllocating] = useState(false);
    const [count, setCount] = useState("");

    function submitAllocate() {
        const n = Number(count);
        if (!Number.isInteger(n) || n <= 0) return;
        allocate(id, n);
        setCount("");
        setAllocating(false);
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {status === "active" && (
                <>
                    {/* §3a admin-initiated direct assignment from the admin pool. */}
                    {allocating ? (
                        <>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={count}
                                onChange={(e) => setCount(e.target.value)}
                                placeholder="count"
                                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                            />
                            <ActionButton tone="primary" disabled={allocBusy} onClick={submitAllocate}>
                                Confirm
                            </ActionButton>
                            <ActionButton
                                tone="neutral"
                                disabled={allocBusy}
                                onClick={() => setAllocating(false)}
                            >
                                Cancel
                            </ActionButton>
                        </>
                    ) : (
                        <ActionButton
                            tone="primary"
                            disabled={allocBusy}
                            onClick={() => setAllocating(true)}
                        >
                            Allocate
                        </ActionButton>
                    )}
                    <ActionButton
                        tone="warn"
                        disabled={busy}
                        onClick={() =>
                            act("suspend", "Suspend this volunteer? They cannot receive tokens while suspended.")
                        }
                    >
                        Suspend
                    </ActionButton>
                    <ActionButton tone="neutral" disabled={busy} onClick={() => act("deactivate")}>
                        Deactivate
                    </ActionButton>
                </>
            )}
            {(status === "suspended" || status === "inactive") && (
                <ActionButton tone="primary" disabled={busy} onClick={() => act("activate")}>
                    Activate
                </ActionButton>
            )}
        </div>
    );
}

/** A pending/decided token-allocation request from a volunteer. */
interface VolunteerRequestRow {
    id: string;
    volunteer_id: string;
    volunteer_name: string | null;
    requested_count: number;
    decided_count: number | null;
    status: string;
    created_at: string;
}

/**
 * Token requests queue — lists GET /api/admin/volunteer-requests and, for pending
 * rows, lets an authorised admin grant (full), partially grant (a count), or deny
 * via POST /api/admin/volunteer-requests/[id]/decide. The list reloads after each
 * decision. POST (not PATCH) means we use a local runner rather than useRowAction.
 */
function VolunteerRequestsSection({ canManage }: { canManage: boolean }) {
    const { items, state, errorMsg, reload } = useAdminList<VolunteerRequestRow>(
        "/api/admin/volunteer-requests",
        "requests",
        "/admin/volunteers"
    );
    const { decide, busyId, actionError } = useDecideRequest(reload);

    const columns = ["Volunteer", "Requested", "Granted", "Status", "Submitted"];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Token requests"
                subtitle="Volunteer requests to be allocated tokens. Grant in full, grant a partial count, or deny."
                count={state === "ready" ? items.length : undefined}
            />

            {actionError && (
                <div className="mb-4">
                    <Notice tone="error" title="Decision failed">
                        {actionError}
                    </Notice>
                </div>
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="token requests"
                emptyHint="Volunteer token requests will appear here once they are submitted."
                table={
                    <TableShell>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        <Dash>{r.volunteer_name}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">{r.requested_count}</td>
                                    <td className="px-4 py-3 text-slate-700">
                                        <Dash>{r.decided_count != null ? r.decided_count : null}</Dash>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={r.status} />
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {new Date(r.created_at).toLocaleDateString()}
                                    </td>
                                    {canManage && (
                                        <td className="px-4 py-3">
                                            <RequestActions
                                                request={r}
                                                busy={busyId === r.id}
                                                decide={decide}
                                            />
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}

/** Per-row decide controls: Grant (full), Partial (count input), Deny. Pending rows only. */
function RequestActions({
    request,
    busy,
    decide,
}: {
    request: VolunteerRequestRow;
    busy: boolean;
    decide: (
        id: string,
        body: { decision: "granted" | "partially_granted" | "denied"; decided_count?: number }
    ) => void;
}) {
    const [partial, setPartial] = useState(false);
    const [count, setCount] = useState("");

    if (request.status !== "pending") {
        return <span className="text-xs text-slate-400">—</span>;
    }

    function submitPartial() {
        const n = Number(count);
        if (!Number.isInteger(n) || n <= 0 || n > request.requested_count) return;
        decide(request.id, { decision: "partially_granted", decided_count: n });
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <ActionButton
                tone="primary"
                disabled={busy}
                onClick={() => decide(request.id, { decision: "granted" })}
            >
                Grant
            </ActionButton>
            {partial ? (
                <>
                    <input
                        type="number"
                        min={1}
                        max={request.requested_count}
                        step={1}
                        value={count}
                        onChange={(e) => setCount(e.target.value)}
                        placeholder="count"
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                    />
                    <ActionButton tone="neutral" disabled={busy} onClick={submitPartial}>
                        Confirm
                    </ActionButton>
                </>
            ) : (
                <ActionButton tone="neutral" disabled={busy} onClick={() => setPartial(true)}>
                    Partial
                </ActionButton>
            )}
            <ActionButton
                tone="danger"
                disabled={busy}
                onClick={() => decide(request.id, { decision: "denied" })}
            >
                Deny
            </ActionButton>
        </div>
    );
}

/**
 * Local POST runner for the decide endpoint (the shared useRowAction is PATCH-only).
 * Tracks a per-row busy id, surfaces the error body, and reloads on success.
 */
function useDecideRequest(reload: () => Promise<void>) {
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const decide = useCallback(
        async (
            id: string,
            body: { decision: "granted" | "partially_granted" | "denied"; decided_count?: number }
        ) => {
            setBusyId(id);
            setActionError(null);
            try {
                const res = await fetch(`/api/admin/volunteer-requests/${id}/decide`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify(body),
                });
                if (res.status === 401) {
                    window.location.href = "/login?redirect=/admin/volunteers";
                    return;
                }
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    setActionError(data.error ?? `Decision failed (${res.status})`);
                    return;
                }
                await reload();
            } catch {
                setActionError("Network error — please try again.");
            } finally {
                setBusyId(null);
            }
        },
        [reload]
    );

    return { decide, busyId, actionError };
}

/**
 * Local POST runner for the §3a admin-initiated allocation endpoint
 * (POST /api/admin/volunteers/[id]/allocate). Mirrors useDecideRequest: tracks a
 * per-row busy id, surfaces the error body, and reloads the registry on success.
 */
function useAllocate(reload: () => Promise<void>) {
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const allocate = useCallback(
        async (id: string, count: number) => {
            setBusyId(id);
            setActionError(null);
            try {
                const res = await fetch(`/api/admin/volunteers/${id}/allocate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ count }),
                });
                if (res.status === 401) {
                    window.location.href = "/login?redirect=/admin/volunteers";
                    return;
                }
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    setActionError(data.error ?? `Allocation failed (${res.status})`);
                    return;
                }
                await reload();
            } catch {
                setActionError("Network error — please try again.");
            } finally {
                setBusyId(null);
            }
        },
        [reload]
    );

    return { allocate, busyId, actionError };
}
