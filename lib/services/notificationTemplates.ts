import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { NotificationChannel } from "@/lib/types/enums";

/**
 * Notification template rendering (addon2 A2).
 *
 * Templates live in the `notification_templates` table (admin-editable copy per
 * (kind, channel)). `dispatchNotification` resolves the active template for an
 * event's kind and renders its {{var}} placeholders against the notification
 * payload. When no active template exists the caller keeps its own hard-coded
 * title/message, so behaviour is unchanged until an admin activates a template.
 *
 * i18n-ready: the copy is data, not code — a future locale column/table can slot
 * in without touching route handlers.
 */

export interface RenderedTemplate {
    subject: string;
    message: string;
}

/**
 * Substitute `{{var}}` tokens in a template string from a flat vars map.
 * Unknown/undefined/null vars render as an empty string (never the literal
 * `undefined`). Whitespace inside the braces is tolerated.
 */
export function fillTemplate(template: string, vars: Record<string, unknown>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
        const value = vars[key];
        return value === undefined || value === null ? "" : String(value);
    });
}

/**
 * Resolve and render the active template for (kind, channel). Returns null when
 * none is active (the caller then falls back to its own copy). Uses the caller's
 * Supabase client — pass the service-role client from server code.
 */
export async function renderTemplate(
    client: SupabaseClient,
    kind: string,
    channel: NotificationChannel,
    vars: Record<string, unknown>
): Promise<RenderedTemplate | null> {
    const { data, error } = await client
        .from("notification_templates")
        .select("subject, body_template")
        .eq("kind", kind)
        .eq("channel", channel)
        .eq("is_active", true)
        .maybeSingle();

    if (error || !data) return null;

    return {
        subject: fillTemplate(data.subject as string, vars),
        message: fillTemplate(data.body_template as string, vars),
    };
}
