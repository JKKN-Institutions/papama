"use client";

import BeneficiaryRegisterForm from "@/components/beneficiary/BeneficiaryRegisterForm";

import {
    Dash,
    ListStates,
    PageHeader,
    StatusBadge,
    TableHead,
    TableShell,
    useVolunteerFetch,
} from "../_ui";

/**
 * Volunteer beneficiary-registration assist (owner §2.2.1, BEN-1, matrix volunteer
 * `create`/`assist`). A volunteer submits registrations (with on-device face
 * enrolment); they CANNOT approve — eligibility approval is admin-only. The list
 * below is RLS-scoped to the registrations this volunteer submitted.
 */

type RegistrationRow = {
    id: string;
    full_name: string | null;
    category: string;
    status: string;
    face_hash_present: boolean;
    aadhaar_present: boolean;
    created_at: string;
};

export default function VolunteerBeneficiariesPage() {
    const { data, state, errorMsg, reload } = useVolunteerFetch<RegistrationRow[]>(
        "/api/admin/beneficiary-registrations",
        "registrations",
        "/volunteer/beneficiaries"
    );
    const items = data ?? [];

    return (
        <div>
            <PageHeader
                title="Register a beneficiary"
                subtitle="Assist a beneficiary's registration. An admin reviews and approves eligibility — you cannot approve."
                count={state === "ready" ? items.length : undefined}
            />

            <BeneficiaryRegisterForm onDone={reload} heading="Register a beneficiary (volunteer assist)" />

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="registrations"
                emptyHint="Submit a registration above — it will appear here pending admin review."
            >
                <TableShell>
                    <TableHead columns={["Name", "Category", "Identity", "Status", "Submitted"]} />
                    <tbody className="divide-y divide-slate-100">
                        {items.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 text-slate-800">
                                    <Dash>{r.full_name}</Dash>
                                </td>
                                <td className="px-4 py-3 capitalize text-slate-700">
                                    {r.category.replace(/_/g, " ")}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-500">
                                    {r.face_hash_present ? "face ✓" : "no face"}
                                    {r.aadhaar_present ? " · aadhaar ✓" : ""}
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
        </div>
    );
}
