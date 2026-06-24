/**
 * English message catalog — the single source of UI strings (spec F-8 / I18N-1).
 *
 * Adding a language is ADDITIVE: create a sibling file (e.g. `ta.ts` for Tamil)
 * with the SAME nested shape, register it in `lib/i18n/index.ts`'s DICTIONARIES,
 * and translate the values. No component code changes — that is what "i18n-ready"
 * means here. Use `{var}` placeholders for interpolation (see `t()`).
 *
 * Rollout: strings are migrated page-by-page from hardcoded JSX to `t("...")`
 * keys under the relevant namespace. The donor credit page header is the first
 * reference migration; the remaining pages follow the same mechanical pattern.
 */
export const en = {
    common: {
        loading: "Loading…",
        error: "Something went wrong",
        retry: "Retry",
        save: "Save",
        cancel: "Cancel",
        confirm: "Confirm",
        close: "Close",
    },
    donor: {
        credit: {
            title: "Credit Registry",
            subtitle:
                "Credits are accumulated via donations. Every ₹{threshold} can be converted into 1 voucher token. Credits are non-withdrawable.",
            availableCredits: "Available Credits",
            convertCta: "Convert to Token",
            nonWithdrawable: "⚠️ Credits are Non-Withdrawable",
            needMore:
                "Need ₹{remaining} more to reach the next ₹{threshold} voucher threshold.",
            sufficient: "Sufficient balance for {count} voucher(s).",
        },
    },
} as const;

export type Messages = typeof en;
