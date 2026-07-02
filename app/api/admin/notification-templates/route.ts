import { z } from "zod";

import { NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin notification-template management (addon2 A2).
 *
 * Templates are staff-only copy for donor notifications, keyed by (kind, channel)
 * and rendered with {{var}} placeholders at send time. Gated under
 * `audit_reports` (like system-config): admin edits, compliance reads.
 */

export const GET = defineRoute({ feature: "audit_reports", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("notification_templates")
        .select("id, kind, channel, subject, body_template, is_active, version, updated_at")
        .order("kind", { ascending: true })
        .order("channel", { ascending: true });

    if (error) throw new Error(error.message);

    return { templates: data ?? [] };
});

const updateSchema = z.object({
    id: z.string().uuid(),
    subject: z.string().trim().min(1).max(200).optional(),
    body_template: z.string().trim().min(1).max(2000).optional(),
    is_active: z.boolean().optional(),
});

export const PATCH = defineRoute(
    { feature: "audit_reports", action: "update" },
    async ({ req, audit }) => {
        const body = await parseBody(req, updateSchema);
        const admin = createAdminClient();

        const { data: existing, error: fetchError } = await admin
            .from("notification_templates")
            .select("id, kind, channel, version")
            .eq("id", body.id)
            .single();

        if (fetchError || !existing) throw new NotFoundError("template not found");

        // Bump version whenever the copy itself changes (not on an active toggle).
        const copyChanged = body.subject !== undefined || body.body_template !== undefined;
        const patch: Record<string, unknown> = {};
        if (body.subject !== undefined) patch.subject = body.subject;
        if (body.body_template !== undefined) patch.body_template = body.body_template;
        if (body.is_active !== undefined) patch.is_active = body.is_active;
        if (copyChanged) patch.version = (existing.version as number) + 1;

        const { error: updateError } = await admin
            .from("notification_templates")
            .update(patch)
            .eq("id", body.id);

        if (updateError) throw new Error(updateError.message);

        await audit({
            action: "notification_template.update",
            entity_table: "notification_templates",
            entity_id: body.id,
            summary: `template ${existing.kind}/${existing.channel} updated`,
            metadata: { fields: Object.keys(patch) },
        });

        return { ok: true, id: body.id };
    }
);
