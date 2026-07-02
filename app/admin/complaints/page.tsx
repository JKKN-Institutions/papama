"use client";

import { useCan } from "@/components/auth/AppUserProvider";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    ListStates,
    StatusBadge,
    TableHead,
    TableShell,
    useAction,
    useAdminList,
} from "../_ui";

/**
 * Admin complaints queue (addon2 A3) — beneficiary complaints (vendor_feedback
 * flagged is_complaint) with a triage lifecycle: open → investigating →
 * resolved/dismissed. Gated by vendor_management (admin + vendor_manager).
 */

interface ComplaintRow {
    id: string;
    vendor_id: string;
    vendor_name: string;
    rating: number;
    comment: string | null;
    complaint_status: string | null;
    resolution: string | null;
    resolved_at: string | null;
    created_at: string;
}

export default function AdminComplaintsPage() {
    const canManage = useCan("vendor_management", "update");
    const { items, state, errorMsg, reload } = useAdminList<ComplaintRow>(
        "/api/admin/complaints",
        "complaints",
        "/admin/complaints"
    );

    const triage = useAction({
        method: "PATCH",
        endpoint: () => "/api/admin/complaints",
        onDone: reload,
        successMessage: (d) => `Complaint marked ${d.complaint_status ?? "updated"}.`,
    });

    const columns = ["Date", "Vendor", "Rating", "Complaint", "Status", "Resolution"];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Complaints"
                subtitle="Beneficiary complaints about vendors. Triage each: start investigating, then resolve or dismiss with a note."
                count={state === "ready" ? items.length : undefined}
            />

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="complaints"
                emptyHint="Complaints raised by beneficiaries will appear here."
                table={
                    <TableShell>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((c) => {
                                const status = c.complaint_status ?? "open";
                                const busy = triage.busyId === c.id;
                                return (
                                    <tr key={c.id} className="hover:bg-slate-50 align-top">
                                        <td className="px-4 py-3 text-slate-500">
                                            {new Date(c.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3 text-slate-800">{c.vendor_name}</td>
                                        <td className="px-4 py-3 text-slate-600">{c.rating}★</td>
                                        <td className="px-4 py-3 text-slate-600 max-w-xs">
                                            <Dash>{c.comment}</Dash>
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge value={status} />
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 max-w-xs">
                                            <Dash>{c.resolution}</Dash>
                                        </td>
                                        {canManage && (
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {status === "open" && (
                                                        <ActionButton
                                                            tone="neutral"
                                                            disabled={busy}
                                                            onClick={() =>
                                                                triage.run(c.id, {
                                                                    id: c.id,
                                                                    complaint_status: "investigating",
                                                                })
                                                            }
                                                        >
                                                            Investigate
                                                        </ActionButton>
                                                    )}
                                                    {status !== "resolved" && status !== "dismissed" && (
                                                        <>
                                                            <ActionButton
                                                                tone="primary"
                                                                disabled={busy}
                                                                onClick={() => {
                                                                    const note = window.prompt(
                                                                        "Resolution note (how was this complaint resolved?)"
                                                                    );
                                                                    if (!note) return;
                                                                    triage.run(c.id, {
                                                                        id: c.id,
                                                                        complaint_status: "resolved",
                                                                        resolution: note,
                                                                    });
                                                                }}
                                                            >
                                                                Resolve
                                                            </ActionButton>
                                                            <ActionButton
                                                                tone="warn"
                                                                disabled={busy}
                                                                onClick={() => {
                                                                    const note = window.prompt(
                                                                        "Reason for dismissing this complaint?"
                                                                    );
                                                                    if (!note) return;
                                                                    triage.run(c.id, {
                                                                        id: c.id,
                                                                        complaint_status: "dismissed",
                                                                        resolution: note,
                                                                    });
                                                                }}
                                                            >
                                                                Dismiss
                                                            </ActionButton>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}
