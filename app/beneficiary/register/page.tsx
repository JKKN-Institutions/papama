"use client";

import Link from "next/link";

import BeneficiaryRegisterForm from "@/components/beneficiary/BeneficiaryRegisterForm";

/**
 * Public beneficiary self-registration (matrix `guest → self_register`).
 *
 * No account is created and no session is required — the shared form captures the
 * enrolment face on-device (only the non-reversible vector is sent) and POSTs to the
 * public /api/beneficiary/register route, which lands a PENDING registration for an
 * admin to review and approve. Mirrors the public vendor-registration page pattern.
 */
export default function BeneficiarySelfRegisterPage() {
    return (
        <main className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                        Register as a beneficiary
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Tell us a little about yourself and capture your face for verification. Our
                        team will review your registration and confirm your eligibility — you do not
                        need an account.
                    </p>
                </div>

                <BeneficiaryRegisterForm
                    heading="Your details"
                    endpoint="/api/beneficiary/register"
                    credentials="omit"
                />

                <p className="mt-4 text-center text-xs text-slate-400">
                    Your photo is processed on this device only — we store a non-reversible
                    verification code, never the image itself.
                </p>
                <p className="mt-2 text-center text-sm text-slate-500">
                    <Link href="/" className="font-medium text-slate-900 hover:underline">
                        Back to home
                    </Link>
                </p>
            </div>
        </main>
    );
}
