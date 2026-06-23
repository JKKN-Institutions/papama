"use client";

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
