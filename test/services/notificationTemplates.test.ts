import { beforeEach, describe, expect, it, vi } from "vitest";

import { fillTemplate, renderTemplate } from "@/lib/services/notificationTemplates";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Spec references:
 * - §3.1 F-7: Notification engine — admin-editable templates per channel/event
 * - §3.3: Notification channels include in_app, sms, email (client Q3/Q4)
 */

describe("fillTemplate", () => {
    it("substitutes simple variables", () => {
        expect(fillTemplate("Hello {{name}}!", { name: "Roja" })).toBe("Hello Roja!");
    });

    it("handles multiple variables", () => {
        const result = fillTemplate("{{donor}} donated ₹{{amount}}", { donor: "Alice", amount: 500 });
        expect(result).toBe("Alice donated ₹500");
    });

    it("replaces undefined/null vars with empty string", () => {
        expect(fillTemplate("Hi {{name}}", {})).toBe("Hi ");
        expect(fillTemplate("Hi {{name}}", { name: null })).toBe("Hi ");
        expect(fillTemplate("Hi {{name}}", { name: undefined })).toBe("Hi ");
    });

    it("tolerates whitespace inside braces", () => {
        expect(fillTemplate("{{ name }}", { name: "Test" })).toBe("Test");
        expect(fillTemplate("{{  name  }}", { name: "Test" })).toBe("Test");
    });

    it("leaves no-variable text untouched", () => {
        expect(fillTemplate("No variables here", {})).toBe("No variables here");
    });

    it("handles numbers and booleans", () => {
        expect(fillTemplate("Count: {{n}}", { n: 42 })).toBe("Count: 42");
        expect(fillTemplate("Active: {{v}}", { v: true })).toBe("Active: true");
    });
});

describe("renderTemplate", () => {
    beforeEach(() => vi.clearAllMocks());

    function buildClient(templateRow: unknown) {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: templateRow, error: null });
        return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    }

    it("renders subject and message from DB template", async () => {
        const client = buildClient({
            subject: "Meal redeemed for {{beneficiary}}",
            body_template: "Your ₹{{amount}} token was used at {{vendor}}",
        });

        const result = await renderTemplate(client, "redemption", "in_app", {
            beneficiary: "patient", amount: 50, vendor: "Anna's Kitchen",
        });

        expect(result).not.toBeNull();
        expect(result!.subject).toBe("Meal redeemed for patient");
        expect(result!.message).toBe("Your ₹50 token was used at Anna's Kitchen");
    });

    it("returns null when no active template", async () => {
        const client = buildClient(null);
        const result = await renderTemplate(client, "redemption", "sms", {});
        expect(result).toBeNull();
    });

    it("returns null on DB error", async () => {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } });
        const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

        const result = await renderTemplate(client, "redemption", "email", {});
        expect(result).toBeNull();
    });
});

describe("spec §3.3: notification channels", () => {
    beforeEach(() => vi.clearAllMocks());

    function buildClient(templateRow: unknown) {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: templateRow, error: null });
        return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    }

    it("template channels include in_app, sms, email (spec §3.3 + client Q3/Q4)", async () => {
        const channels = ["in_app", "sms", "email"] as const;
        const templateRow = {
            subject: "Test subject",
            body_template: "Test body",
        };

        for (const channel of channels) {
            const client = buildClient(templateRow);
            const result = await renderTemplate(client, "redemption", channel, {});
            // Each channel should resolve a template when one exists in the DB
            expect(result).not.toBeNull();
            expect(result!.subject).toBe("Test subject");
        }
    });
});
