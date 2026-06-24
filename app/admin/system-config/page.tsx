"use client";

import { useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { SystemConfigRow } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    ListStates,
    Notice,
    TableHead,
    TableShell,
    useAdminList,
} from "../_ui";

/**
 * Admin system-config page — admin-tunable rules read at runtime (contract §1).
 * Admins can edit a row's value inline; the server coerces it to the row's
 * `value_type`. A null `value` is intentional ("unset", e.g.
 * max_tokens_per_volunteer pending the mentor's number) and can be set via
 * "Unset" — never a guessed default.
 */
export default function AdminSystemConfigPage() {
    const canManage = useCan("audit_reports", "update");
    const { items, state, errorMsg, reload } = useAdminList<SystemConfigRow>(
        "/api/admin/system-config",
        "config",
        "/admin/system-config"
    );

    const columns = ["Key", "Value", "Type", "Description", "Updated"];
    if (canManage) columns.push("Edit");

    return (
        <div>
            <AdminPageHeader
                title="System config"
                subtitle="Admin-tunable rules read at runtime. Unset values are shown, never guessed."
                count={state === "ready" ? items.length : undefined}
            />
            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="config rows"
                emptyHint="Configuration rows will appear here once they are seeded."
                table={
                    <TableShell>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((c) => (
                                <ConfigRow
                                    key={c.key}
                                    row={c}
                                    canManage={canManage}
                                    reload={reload}
                                />
                            ))}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}

function ConfigRow({
    row,
    canManage,
    reload,
}: {
    row: SystemConfigRow;
    canManage: boolean;
    reload: () => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<string>(row.value ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function startEdit() {
        setDraft(row.value ?? (row.value_type === "boolean" ? "true" : ""));
        setError(null);
        setEditing(true);
    }

    async function save(unset: boolean) {
        let value: string | number | boolean | null;
        if (unset) {
            value = null;
        } else if (row.value_type === "number") {
            value = draft.trim() === "" ? null : Number(draft);
        } else if (row.value_type === "boolean") {
            value = draft === "true";
        } else {
            value = draft;
        }

        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/system-config", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: row.key, value }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.error ?? `Save failed (${res.status})`);
                return;
            }
            setEditing(false);
            await reload();
        } finally {
            setSaving(false);
        }
    }

    return (
        <tr className="hover:bg-slate-50">
            <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">{row.key}</td>
            <td className="px-4 py-3 text-slate-700">
                {editing ? (
                    <ValueEditor row={row} draft={draft} setDraft={setDraft} disabled={saving} />
                ) : row.value == null ? (
                    <span className="text-xs italic text-amber-600">unset</span>
                ) : (
                    <span className="font-medium">{row.value}</span>
                )}
                {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            </td>
            <td className="px-4 py-3 text-slate-500">{row.value_type}</td>
            <td className="px-4 py-3 text-slate-600">
                <Dash>{row.description}</Dash>
            </td>
            <td className="px-4 py-3 text-slate-500">
                {new Date(row.updated_at).toLocaleDateString()}
            </td>
            {canManage && (
                <td className="px-4 py-3">
                    {editing ? (
                        <div className="flex flex-wrap gap-1.5">
                            <ActionButton tone="primary" disabled={saving} onClick={() => save(false)}>
                                Save
                            </ActionButton>
                            <ActionButton tone="neutral" disabled={saving} onClick={() => save(true)}>
                                Unset
                            </ActionButton>
                            <ActionButton
                                tone="neutral"
                                disabled={saving}
                                onClick={() => {
                                    setEditing(false);
                                    setError(null);
                                }}
                            >
                                Cancel
                            </ActionButton>
                        </div>
                    ) : (
                        <ActionButton tone="neutral" disabled={false} onClick={startEdit}>
                            Edit
                        </ActionButton>
                    )}
                </td>
            )}
        </tr>
    );
}

function ValueEditor({
    row,
    draft,
    setDraft,
    disabled,
}: {
    row: SystemConfigRow;
    draft: string;
    setDraft: (v: string) => void;
    disabled: boolean;
}) {
    const base =
        "rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 disabled:opacity-60";

    if (row.value_type === "boolean") {
        return (
            <select
                value={draft === "true" ? "true" : "false"}
                onChange={(e) => setDraft(e.target.value)}
                disabled={disabled}
                className={base}
            >
                <option value="true">true</option>
                <option value="false">false</option>
            </select>
        );
    }

    return (
        <input
            type={row.value_type === "number" ? "number" : "text"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled}
            placeholder={row.value_type === "number" ? "number (blank = unset)" : "value"}
            className={`${base} w-40`}
        />
    );
}
