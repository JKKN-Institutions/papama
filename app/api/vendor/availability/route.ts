import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRemainingCapacity } from "@/lib/services/vendorCapacity";

/**
 * GET + PATCH /api/vendor/availability — the signed-in vendor reads/sets their
 * own serving availability + daily capacity (addon #4).
 *
 * Gated by `vendor_management/read|update` (scope own). The mutation runs on the
 * session (RLS) client so `vendors_update_own` scopes it to this owner; the
 * availability columns are NOT in guard_vendor_controlled_cols (vendors
 * self-manage them, like settlement_cycle), so the update is permitted. GET also
 * returns today's served count + remaining capacity (read via the admin client
 * for the usage row, after the matrix check has passed).
 */
export const GET = defineRoute(
    { feature: "vendor_capacity_availability", action: "read", scope: "own" },
    async ({ user }) => {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("vendors")
            .select("id, name, status, is_open, stock_exhausted, temporary_closure_until, daily_meal_capacity")
            .eq("owner_id", user.id)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return { availability: null };

        const v = data as {
            id: string;
            name: string;
            status: string;
            is_open: boolean | null;
            stock_exhausted: boolean | null;
            temporary_closure_until: string | null;
            daily_meal_capacity: number | null;
        };

        // Today's usage is privileged (RLS scopes it, but the admin read is simplest
        // here and we already resolved the caller is this vendor's owner).
        const admin = createAdminClient();
        const usage = await getRemainingCapacity(v.id, admin);

        return {
            availability: {
                vendor_id: v.id,
                name: v.name,
                status: v.status,
                is_open: v.is_open ?? true,
                stock_exhausted: v.stock_exhausted ?? false,
                temporary_closure_until: v.temporary_closure_until,
                daily_meal_capacity: v.daily_meal_capacity,
                served_today: usage.served,
                remaining_today: usage.remaining,
            },
        };
    }
);

const availabilityPatchSchema = z
    .object({
        is_open: z.boolean().optional(),
        stock_exhausted: z.boolean().optional(),
        // ISO timestamp or null to clear a temporary closure.
        temporary_closure_until: z.string().datetime().nullable().optional(),
        // null clears the cap (uncapped); otherwise a non-negative integer.
        daily_meal_capacity: z.number().int().min(0).nullable().optional(),
    })
    .strict();

export const PATCH = defineRoute(
    { feature: "vendor_capacity_availability", action: "update", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, availabilityPatchSchema);

        const update: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(body)) {
            if (value !== undefined) update[key] = value;
        }
        if (Object.keys(update).length === 0) {
            throw new BadRequestError("no availability fields supplied");
        }
        update.updated_at = new Date().toISOString();

        // Session client → vendors_update_own applies; the availability columns are
        // not guarded, so a vendor may set them on their own row.
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("vendors")
            .update(update)
            .eq("owner_id", user.id)
            .select("id, is_open, stock_exhausted, temporary_closure_until, daily_meal_capacity")
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new BadRequestError("no vendor profile for this account");

        await audit({
            action: "vendor.availability.update",
            entity_table: "vendors",
            entity_id: (data as { id: string }).id,
            summary: "vendor updated serving availability/capacity",
            metadata: { fields: Object.keys(update).filter((k) => k !== "updated_at") },
        });

        return { availability: data };
    }
);
