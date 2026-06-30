import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { mealWindowUpdateRequestSchema } from "@/lib/validation/schemas";

/**
 * PATCH + DELETE /api/admin/meal-windows/[id] — edit/toggle or remove one meal
 * window (addon #1). Both admin-only (audit_reports/{update,delete}); a non-admin
 * is filtered by the matrix before the handler runs. Mutations run on the
 * service-role client AFTER the matrix check; every change writes an audit row.
 */

export const PATCH = defineRoute<{ id: string }>(
    { feature: "audit_reports", action: "update" },
    async ({ req, params, audit }) => {
        const body = await parseBody(req, mealWindowUpdateRequestSchema);
        const admin = createAdminClient();

        const { data: existing, error: fetchError } = await admin
            .from("meal_windows")
            .select("id, meal_type, vendor_id, start_time, end_time, is_active")
            .eq("id", params.id)
            .maybeSingle();
        if (fetchError) throw new Error(fetchError.message);
        if (!existing) throw new NotFoundError("meal window not found");

        // Collect only the supplied fields.
        const update: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(body)) {
            if (value !== undefined) update[key] = value;
        }
        if (Object.keys(update).length === 0) {
            throw new BadRequestError("no editable fields supplied");
        }

        // Re-validate the MERGED start/end against the same-day rule — a partial
        // PATCH (e.g. only start_time) could otherwise cross the stored end_time
        // (the schema's times-only refine can't see the stored value).
        const mergedStart = (update.start_time as string) ?? existing.start_time;
        const mergedEnd = (update.end_time as string) ?? existing.end_time;
        // Postgres time renders as 'HH:MM:SS'; compare the leading HH:MM only.
        const hhmm = (t: string) => t.slice(0, 5);
        if (hhmm(mergedStart) >= hhmm(mergedEnd)) {
            throw new BadRequestError(
                "start_time must be before end_time (overnight windows are out of scope)"
            );
        }

        const { data, error } = await admin
            .from("meal_windows")
            .update(update)
            .eq("id", params.id)
            .select("id, meal_type, vendor_id, start_time, end_time, is_active, created_at, updated_at")
            .single();
        if (error || !data) throw new Error(error?.message ?? "failed to update meal window");

        await audit({
            action: "meal_window.update",
            entity_table: "meal_windows",
            entity_id: params.id,
            summary: `updated ${data.meal_type} window → ${data.start_time}–${data.end_time}, ${
                data.is_active ? "active" : "inactive"
            }`,
            metadata: { fields: Object.keys(update), ...update },
        });

        return { window: data };
    }
);

export const DELETE = defineRoute<{ id: string }>(
    { feature: "audit_reports", action: "delete" },
    async ({ params, audit }) => {
        const admin = createAdminClient();

        const { data, error } = await admin
            .from("meal_windows")
            .delete()
            .eq("id", params.id)
            .select("id, meal_type, vendor_id, start_time, end_time")
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new NotFoundError("meal window not found");

        await audit({
            action: "meal_window.delete",
            entity_table: "meal_windows",
            entity_id: params.id,
            summary: `removed ${data.meal_type} window ${data.start_time}–${data.end_time}${
                data.vendor_id ? " (vendor override)" : " (global)"
            }`,
            metadata: { meal_type: data.meal_type, vendor_id: data.vendor_id },
        });

        return { id: params.id, deleted: true };
    }
);
