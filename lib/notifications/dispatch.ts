import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { renderTemplate } from "@/lib/services/notificationTemplates";
import type { NotificationChannel } from "@/lib/types/enums";

/**
 * Multi-channel notification dispatcher — seam layer for SMS / email / WhatsApp.
 *
 * The `notifications` table (channel defaulting to `in_app`) is the ONLY channel
 * that is fully wired. SMS, email, and WhatsApp are SEAMS: each adapter checks for
 * its respective provider env var and logs a clear skip message when unset. They
 * NEVER throw and NEVER block the caller request — missing provider = graceful no-op.
 *
 * Provider env vars a real integration will need (set these when the client procures
 * a provider — see ASSUMPTIONS.md open items for email/SMS/WhatsApp):
 *   SMS_PROVIDER_API_KEY      — e.g. Twilio / TextLocal / MSG91 auth key
 *   SMS_PROVIDER_SENDER_ID    — alphanumeric sender (e.g. "PAPAMA")
 *   EMAIL_PROVIDER_API_KEY    — e.g. SendGrid / Postmark / Mailgun API key
 *   EMAIL_PROVIDER_FROM       — from address (e.g. "noreply@papama.in")
 *   WHATSAPP_PROVIDER_API_KEY — e.g. Twilio WhatsApp / Gupshup token
 *   WHATSAPP_PROVIDER_PHONE   — sender phone number in E.164 format
 *
 * Callers may pass `channels` to opt into additional delivery channels for a
 * specific event type; the default is `['in_app']` so nothing changes unless the
 * env vars are set AND the caller requests extra channels.
 */

export interface NotificationPayload {
    donorId: string;
    kind: string;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
    /** Additional delivery channels beyond `in_app`. Defaults to none. */
    channels?: NotificationChannel[];
    /**
     * Values fed to an admin-editable template's {{var}} placeholders. Defaults
     * to `metadata` when omitted, so redemption/thank-you alerts render their
     * vendor_name/value_inr/etc. without extra plumbing.
     */
    templateVars?: Record<string, unknown>;
}

/**
 * Insert the `in_app` notifications row and fan out to any configured channels.
 *
 * @param admin  Service-role Supabase client (caller already has one).
 * @param p      Notification payload.
 */
export async function dispatchNotification(
    admin: SupabaseClient,
    p: NotificationPayload
): Promise<void> {
    // Resolve an admin-editable template for this kind, if one is active. When
    // none exists, fall back to the caller-supplied title/message (unchanged
    // behaviour). Template rendering must never break delivery, so a failure
    // here degrades to the caller's copy.
    const vars = p.templateVars ?? p.metadata ?? {};
    let title = p.title;
    let message = p.message;
    try {
        const tpl = await renderTemplate(admin, p.kind, "in_app", vars);
        if (tpl) {
            title = tpl.subject;
            message = tpl.message;
        }
    } catch (err) {
        console.warn(`[notifications] template render failed for kind=${p.kind}, using caller copy`, err);
    }

    // Always insert the in_app row — this is the real, working channel.
    await admin.from("notifications").insert({
        donor_id: p.donorId,
        kind: p.kind,
        title,
        message,
        metadata: p.metadata ?? {},
    });

    // Fan out to any additional configured channels (no-op seams for now).
    const extra = p.channels ?? [];
    for (const channel of extra) {
        if (channel === "in_app") continue; // already handled above

        if (channel === "sms") {
            await _sendSms(p);
        } else if (channel === "email") {
            await _sendEmail(p);
        } else if (channel === "whatsapp") {
            await _sendWhatsApp(p);
        }
    }
}

// ---------------------------------------------------------------------------
// Adapter stubs — flagged NO-OP seams. Each:
//   1. Checks its provider env var.
//   2. Logs a clear skip message when unset — NEVER throws, NEVER blocks.
//   3. Is swapped out for a real call when the client procures a provider.
// ---------------------------------------------------------------------------

async function _sendSms(p: NotificationPayload): Promise<void> {
    if (!process.env.SMS_PROVIDER_API_KEY) {
        console.log(
            `[notifications] sms not configured (provider TBD) — skipping for donor ${p.donorId} kind=${p.kind}`
        );
        return;
    }
    // TODO: wire real SMS provider here (e.g. MSG91 / Twilio / TextLocal).
    // Required env: SMS_PROVIDER_API_KEY, SMS_PROVIDER_SENDER_ID
    console.log(`[notifications] sms stub — would send "${p.title}" to donor ${p.donorId}`);
}

async function _sendEmail(p: NotificationPayload): Promise<void> {
    if (!process.env.EMAIL_PROVIDER_API_KEY) {
        console.log(
            `[notifications] email not configured (provider TBD) — skipping for donor ${p.donorId} kind=${p.kind}`
        );
        return;
    }
    // TODO: wire real email provider here (e.g. SendGrid / Postmark / Mailgun).
    // Required env: EMAIL_PROVIDER_API_KEY, EMAIL_PROVIDER_FROM
    console.log(`[notifications] email stub — would send "${p.title}" to donor ${p.donorId}`);
}

async function _sendWhatsApp(p: NotificationPayload): Promise<void> {
    if (!process.env.WHATSAPP_PROVIDER_API_KEY) {
        console.log(
            `[notifications] whatsapp not configured (provider TBD) — skipping for donor ${p.donorId} kind=${p.kind}`
        );
        return;
    }
    // TODO: wire real WhatsApp provider here (e.g. Twilio WhatsApp / Gupshup).
    // Required env: WHATSAPP_PROVIDER_API_KEY, WHATSAPP_PROVIDER_PHONE
    console.log(`[notifications] whatsapp stub — would send "${p.title}" to donor ${p.donorId}`);
}
