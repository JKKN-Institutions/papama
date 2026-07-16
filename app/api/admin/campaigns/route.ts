import { defineRoute, parseBody } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import { campaignCreateRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/admin/campaigns — minimal campaign creation (addon #9's demo
 * step 11 needs an "emergency campaign" to exist; `campaigns` is a general
 * donor-facing table, not emergency-specific — pass `category: "emergency"`
 * for the emergency case). No dedicated admin campaign route existed before
 * this. Gated by `emergency_disaster_mode/create` (admin only per the
 * matrix) — scoped narrowly to the emergency use case rather than a general
 * campaign-management surface, which is out of scope here.
 */
export const POST = defineRoute(
    { feature: "emergency_disaster_mode", action: "create" },
    async ({ req, audit }) => {
        const body = await parseBody(req, campaignCreateRequestSchema);
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("campaigns")
            .insert({
                title: body.title,
                description: body.description ?? "",
                organization_name: body.organization_name,
                category: body.category,
                location: body.location ?? null,
                target_tokens: body.target_tokens ?? 0,
                token_price_inr: body.token_price_inr,
            })
            .select("id")
            .single();
        if (error || !data) throw new Error(error?.message ?? "failed to create campaign");

        await audit({
            action: "campaign.create",
            entity_table: "campaigns",
            entity_id: data.id,
            summary: `campaign '${body.title}' created (${body.category})`,
            metadata: { category: body.category, organization_name: body.organization_name },
        });

        return { id: data.id };
    }
);
