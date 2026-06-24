"use client";

import { useCan } from "@/components/auth/AppUserProvider";

import {
    AdminPageHeader,
    Dash,
    ListStates,
    RunJobBar,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
} from "../_ui";

type TokenRow = {
    id: string;
    status: string;
    token_type: string;
    value_inr: number | null;
    has_donor: boolean;
    has_beneficiary: boolean;
    minted_at: string | null;
    expires_at: string | null;
    redeemed_at: string | null;
};

/** Admin token registry — lifecycle view + the expire-sweep trigger (token-flow §6, TOK-6). */
export default function AdminTokensPage() {
    const canSweep = useCan("token_generation", "update");
    const { items, state, errorMsg, reload } = useAdminList<TokenRow>(
        "/api/admin/tokens",
        "tokens",
        "/admin/tokens"
    );

    return (
        <div>
            <AdminPageHeader
                title="Tokens"
                subtitle="Token registry by lifecycle status. Run the expire-sweep to auto-invalidate tokens past their expiry."
                count={state === "ready" ? items.length : undefined}
            />

            {canSweep && (
                <RunJobBar
                    label="Expiry sweep:"
                    endpoint="/api/admin/tokens/expire-sweep"
                    buttonText="Run expire-sweep"
                    busyText="Sweeping…"
                    successMessage={(d) =>
                        Number(d.expired) > 0
                            ? `Invalidated ${d.expired} expired token(s).`
                            : "No tokens were past expiry."
                    }
                    onDone={reload}
                />
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="tokens"
                emptyHint="Minted tokens will appear here."
                table={
                    <TableShell>
                        <TableHead columns={["Token", "Type", "Value", "Status", "Minted", "Expires", "Redeemed"]} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((t) => (
                                <tr key={t.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                        {t.id.slice(0, 8)}
                                    </td>
                                    <td className="px-4 py-3 capitalize text-slate-700">
                                        {t.token_type.replace(/_/g, " ")}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        {t.value_inr != null ? `₹${t.value_inr.toLocaleString("en-IN")}` : "—"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={t.status} />
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        <Dash>{t.minted_at ? new Date(t.minted_at).toLocaleDateString() : null}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        <Dash>{t.expires_at ? new Date(t.expires_at).toLocaleDateString() : null}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        <Dash>{t.redeemed_at ? new Date(t.redeemed_at).toLocaleDateString() : null}</Dash>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}

