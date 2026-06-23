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
    const { items, state, errorMsg, reload } = useAdminList<VolunteerResponse>(
        "/api/admin/volunteers",
        "volunteers",
        "/admin/volunteers"
    );
    const { run, busyId, actionError } = useRowAction("/api/admin/volunteers", reload);

    const columns = ["Name", "Email", "Phone", "Status", "Joined"];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Volunteers"
                subtitle="Volunteers who receive, hold and distribute tokens to beneficiaries."
                count={state === "ready" ? items.length : undefined}
            />

            {actionError && (
                <div className="mb-4">
                    <Notice tone="error" title="Action failed">
                        {actionError}
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

function VolunteerActions({
    id,
    status,
    busy,
    run,
}: {
    id: string;
    status: VolunteerResponse["status"];
    busy: boolean;
    run: (rowId: string, payload: Record<string, unknown>, confirmText?: string) => void;
}) {
    const act = (action: string, confirmText?: string) =>
        run(id, { volunteer_id: id, action }, confirmText);

    return (
        <div className="flex flex-wrap gap-1.5">
            {status === "active" && (
                <>
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
