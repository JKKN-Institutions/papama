"use client";

import { useMemo, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { SystemConfigRow } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    ListStates,
    Notice,
    SectionHeading,
    StatusBadge,
    useAdminList,
    useToast,
} from "../_ui";

/**
 * Admin emergency / disaster-relief page (addon #8). Three controls, all backed
 * by existing routes:
 *   1. a toggle for `emergency_mode_enabled` (PATCH /api/admin/system-config),
 *   2. the relaxed limits `emergency_max_meals_per_day` /
 *      `emergency_meal_cooldown_hours` (same config route), and
 *   3. "issue emergency token" → POST /api/admin/emergency/grant.
 *
 * The relaxed-limit ENFORCEMENT lives in the redemption engine (Wave 1) — this
 * page only edits the config the engine reads + mints relief tokens.
 *
 * OPEN ITEM (client Q7): how a beneficiary proves they are disaster-affected is
 * undecided, so issuing a relief token is NOT proof-gated yet.
 */
export default function AdminEmergencyPage() {
    return <EmergencyInner />;
}

const MODE_KEY = "emergency_mode_enabled";
const MAX_KEY = "emergency_max_meals_per_day";
const COOLDOWN_KEY = "emergency_meal_cooldown_hours";

function EmergencyInner() {
    const canManage = useCan("audit_reports", "update");
    const { items, state, errorMsg, reload } = useAdminList<SystemConfigRow>(
        "/api/admin/system-config",
        "config",
        "/admin/emergency"
    );

    const byKey = useMemo(() => {
        const m = new Map<string, SystemConfigRow>();
        for (const r of items) m.set(r.key, r);
        return m;
    }, [items]);

    const mode = byKey.get(MODE_KEY);
    const emergencyOn = mode?.value === "true";

    return (
        <div>
            <AdminPageHeader
                title="Emergency mode"
                subtitle="Disaster-relief switch, relaxed meal limits, and emergency token issuance."
            />

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="emergency settings"
                emptyHint="Emergency configuration rows will appear once they are seeded."
                table={
                    <div className="space-y-6">
                        {emergencyOn && (
                            <Notice tone="warn" title="Emergency mode is ACTIVE">
                                Relaxed per-day meal limits and cooldown are in effect for every
                                beneficiary. Turn this off once the relief window closes.
                            </Notice>
                        )}

                        <ModeToggle on={emergencyOn} canManage={canManage} reload={reload} />

                        <LimitsPanel
                            canManage={canManage}
                            max={byKey.get(MAX_KEY)}
                            cooldown={byKey.get(COOLDOWN_KEY)}
                            reload={reload}
                        />

                        {canManage && <IssueTokenPanel />}
                    </div>
                }
            />
        </div>
    );
}

async function patchConfig(key: string, value: string | number | boolean | null) {
    const res = await fetch("/api/admin/system-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
    }
}

function Card({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">{children}</div>
    );
}

function ModeToggle({
    on,
    canManage,
    reload,
}: {
    on: boolean;
    canManage: boolean;
    reload: () => Promise<void>;
}) {
    const toast = useToast();
    const [busy, setBusy] = useState(false);

    async function toggle() {
        setBusy(true);
        try {
            await patchConfig(MODE_KEY, !on);
            toast.success(on ? "Emergency mode turned off." : "Emergency mode turned ON.");
            await reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Save failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-slate-900">Disaster relief mode</h2>
                        <StatusBadge value={on ? "active" : "inactive"} />
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                        Toggles <code className="font-mono text-xs">{MODE_KEY}</code>. When on, the
                        redemption engine applies the relaxed limits below.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={toggle}
                    disabled={!canManage || busy}
                    className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition focus-visible:ring-2 focus-visible:ring-offset-1 active:scale-[.98] disabled:opacity-50 ${
                        on
                            ? "bg-orange-600 hover:bg-orange-700 focus-visible:ring-orange-400"
                            : "bg-slate-900 hover:bg-slate-700 focus-visible:ring-slate-400"
                    }`}
                >
                    {busy ? "Saving…" : on ? "Turn off emergency mode" : "Turn on emergency mode"}
                </button>
            </div>
        </Card>
    );
}

function LimitsPanel({
    canManage,
    max,
    cooldown,
    reload,
}: {
    canManage: boolean;
    max?: SystemConfigRow;
    cooldown?: SystemConfigRow;
    reload: () => Promise<void>;
}) {
    return (
        <Card>
            <SectionHeading
                title="Relaxed limits"
                subtitle="Used only while emergency mode is on. Leave unset to relax the rule entirely (soft — never blocks redemption)."
            />
            <div className="grid gap-4 sm:grid-cols-2">
                <NumberConfig
                    label="Max meals per day"
                    row={max}
                    fallbackKey={MAX_KEY}
                    canManage={canManage}
                    reload={reload}
                />
                <NumberConfig
                    label="Meal cooldown (hours)"
                    row={cooldown}
                    fallbackKey={COOLDOWN_KEY}
                    canManage={canManage}
                    reload={reload}
                />
            </div>
        </Card>
    );
}

function NumberConfig({
    label,
    row,
    fallbackKey,
    canManage,
    reload,
}: {
    label: string;
    row?: SystemConfigRow;
    fallbackKey: string;
    canManage: boolean;
    reload: () => Promise<void>;
}) {
    const toast = useToast();
    const key = row?.key ?? fallbackKey;
    const [draft, setDraft] = useState<string>(row?.value ?? "");
    const [busy, setBusy] = useState(false);

    async function save(unset: boolean) {
        setBusy(true);
        try {
            const value = unset ? null : draft.trim() === "" ? null : Number(draft);
            await patchConfig(key, value);
            toast.success(unset ? `Unset ${key}.` : `Saved ${key}.`);
            if (unset) setDraft("");
            await reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Save failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {label}
            </label>
            <p className="mb-1.5 font-mono text-[11px] text-slate-400">{key}</p>
            <div className="flex items-center gap-2">
                <input
                    type="number"
                    min={0}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={!canManage || busy}
                    placeholder={row?.value == null ? "unset" : undefined}
                    className="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 disabled:opacity-60"
                />
                {canManage && (
                    <>
                        <ActionButton tone="primary" disabled={busy} onClick={() => save(false)}>
                            Save
                        </ActionButton>
                        <ActionButton tone="neutral" disabled={busy} onClick={() => save(true)}>
                            Unset
                        </ActionButton>
                    </>
                )}
            </div>
            {row?.value == null && (
                <p className="mt-1 text-xs italic text-amber-600">
                    Currently unset — the rule is relaxed (no cap) during emergency mode.
                </p>
            )}
        </div>
    );
}

function IssueTokenPanel() {
    const toast = useToast();
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [lastSerial, setLastSerial] = useState<string | null>(null);

    async function issue() {
        setBusy(true);
        try {
            const res = await fetch("/api/admin/emergency/grant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: reason.trim() || undefined }),
            });
            const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            if (!res.ok) {
                toast.error((data.error as string) ?? `Failed (${res.status})`);
                return;
            }
            const serial = (data.serial_number as string) ?? null;
            setLastSerial(serial);
            setReason("");
            toast.success(`Emergency token issued${serial ? ` (${serial})` : ""}.`);
        } catch {
            toast.error("Network error — please try again.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <SectionHeading
                title="Issue an emergency token"
                subtitle="Mints one Standard relief token into the admin pool for volunteer distribution. Recorded in the grant trail and audit log."
            />
            <Notice tone="info" title="Proof rules pending (client Q7)">
                How a beneficiary proves they are disaster-affected is undecided, so issuance is not
                proof-gated yet. Use the reason field to justify each grant.
            </Notice>
            <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
                    Reason (optional)
                    <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={busy}
                        maxLength={500}
                        placeholder="e.g. Coimbatore flood relief — camp 3"
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 disabled:opacity-60"
                    />
                </label>
                <button
                    type="button"
                    onClick={issue}
                    disabled={busy}
                    className="rounded-lg bg-orange-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1 active:scale-[.98] disabled:opacity-60"
                >
                    {busy ? "Issuing…" : "Issue token"}
                </button>
            </div>
            {lastSerial && (
                <p className="mt-3 text-sm text-green-700">
                    Last issued: <span className="font-mono">{lastSerial}</span> — now in the admin
                    pool.
                </p>
            )}
        </Card>
    );
}
