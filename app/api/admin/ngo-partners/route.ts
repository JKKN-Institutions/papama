import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { NgoPartnerResponse } from "@/lib/validation/schemas";

const createSchema = z.object({
    name: z.string().trim().min(1).max(160),
    registration_number: z.string().trim().max(80).optional(),
    focus_area: z.string().trim().max(160).optional(),
    contact_person: z.string().trim().max(120).optional(),
    contact_email: z.string().trim().email().max(160).optional(),
    contact_phone: z.string().trim().max(40).optional(),
    address: z.string().trim().max(300).optional(),
    city: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
});

const patchSchema = z.object({
    id: z.string().uuid(),
    status: z.enum(["active", "inactive", "suspended"]),
});

/**
 * GET /api/admin/ngo-partners — partner NGO registry (M13, spec §5).
 *
 * Gated by `audit_reports/read` (admin + compliance) — admin manages, compliance
 * has read oversight (matrix §6 "Audit & Reports" altitude). `status` is
 * text+CHECK (active|inactive|suspended); the ngo_status enum is a later slice.
 */
export const GET = defineRoute({ feature: "institution_bulk_allocation", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("ngo_partners")
        .select(
            "id, name, registration_number, focus_area, contact_person, contact_email, contact_phone, address, city, contact_user_id, status, notes, created_at, updated_at"
        )
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const ngo_partners: NgoPartnerResponse[] = (data ?? []).map((n) => ({
        id: n.id,
        name: n.name,
        registration_number: n.registration_number,
        focus_area: n.focus_area,
        contact_person: n.contact_person,
        contact_email: n.contact_email,
        contact_phone: n.contact_phone,
        address: n.address,
        city: n.city,
        contact_user_id: n.contact_user_id,
        status: n.status,
        notes: n.notes,
        created_at: n.created_at,
        updated_at: n.updated_at,
    }));

    return { ngo_partners, total: ngo_partners.length };
});

/**
 * POST /api/admin/ngo-partners — register a partner NGO (M13). Gated by
 * `audit_reports/create` (admin). Lands `active`. Audited.
 */
export const POST = defineRoute(
    { feature: "institution_bulk_allocation", action: "create" },
    async ({ req, audit }) => {
        const body = await parseBody(req, createSchema);
        const admin = createAdminClient();

        const { data, error } = await admin
            .from("ngo_partners")
            .insert({
                name: body.name,
                registration_number: body.registration_number ?? null,
                focus_area: body.focus_area ?? null,
                contact_person: body.contact_person ?? null,
                contact_email: body.contact_email ?? null,
                contact_phone: body.contact_phone ?? null,
                address: body.address ?? null,
                city: body.city ?? null,
                notes: body.notes ?? null,
                status: "active",
            })
            .select("id")
            .single();
        if (error || !data) throw new Error(error?.message ?? "failed to create NGO partner");
        const id = (data as { id: string }).id;

        await audit({
            action: "ngo_partner.create",
            entity_table: "ngo_partners",
            entity_id: id,
            summary: `registered NGO partner '${body.name}'`,
            metadata: { name: body.name },
        });

        return { ok: true, id };
    }
);

/**
 * PATCH /api/admin/ngo-partners — change a partner's status (M13). Gated by
 * `audit_reports/update` (admin). active | inactive | suspended. Audited.
 */
export const PATCH = defineRoute(
    { feature: "institution_bulk_allocation", action: "update" },
    async ({ req, audit }) => {
        const body = await parseBody(req, patchSchema);
        const admin = createAdminClient();

        const { data: current, error: fetchError } = await admin
            .from("ngo_partners")
            .select("id, status")
            .eq("id", body.id)
            .maybeSingle();
        if (fetchError) throw new Error(fetchError.message);
        if (!current) throw new NotFoundError("NGO partner not found");
        if (current.status === body.status) {
            throw new BadRequestError(`partner is already '${body.status}'`);
        }

        const { error } = await admin
            .from("ngo_partners")
            .update({ status: body.status, updated_at: new Date().toISOString() })
            .eq("id", body.id);
        if (error) throw new Error(error.message);

        await audit({
            action: "ngo_partner.status",
            entity_table: "ngo_partners",
            entity_id: body.id,
            summary: `NGO partner: ${current.status} → ${body.status}`,
            metadata: { from: current.status, to: body.status },
        });

        return { ok: true, id: body.id, status: body.status };
    }
);
