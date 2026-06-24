import { en, type Messages } from "./en";

/**
 * Minimal, dependency-free i18n (spec F-8 / I18N-1). `t()` is a pure function, so
 * it works in BOTH server and client components with no provider — important for
 * this App-Router codebase. Single language (English) today; adding a locale is
 * purely additive: add a dictionary with the same shape and register it below.
 *
 *   import { t } from "@/lib/i18n";
 *   t("donor.credit.title")                         // "Credit Registry"
 *   t("donor.credit.needMore", { remaining: 20, threshold: 50 })
 *
 * Unknown keys fall back to the English value, then to the key string itself, so a
 * missing translation degrades visibly (never crashes).
 */

const DICTIONARIES = { en } as const;
export type Locale = keyof typeof DICTIONARIES;
export const DEFAULT_LOCALE: Locale = "en";

type Vars = Record<string, string | number>;

function lookup(dict: unknown, path: string): string | undefined {
    const v = path.split(".").reduce<unknown>(
        (acc, k) =>
            acc && typeof acc === "object"
                ? (acc as Record<string, unknown>)[k]
                : undefined,
        dict
    );
    return typeof v === "string" ? v : undefined;
}

function interpolate(template: string, vars?: Vars): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
        vars[name] != null ? String(vars[name]) : `{${name}}`
    );
}

export function t(key: string, vars?: Vars, locale: Locale = DEFAULT_LOCALE): string {
    const raw =
        lookup(DICTIONARIES[locale], key) ?? lookup(DICTIONARIES.en, key) ?? key;
    return interpolate(raw, vars);
}

export type { Messages };
