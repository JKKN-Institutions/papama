import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub server-only + mock the admin client
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { writeAuditLog, writeAuditLogs, AuditError, type AuditInput } from "@/lib/services/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeUser, fakeSupabaseWrite } from "@test/helpers";

const createAdminClientMock = vi.mocked(createAdminClient);

function fakeInsertClient(error: null | string = null) {
    const insert = vi.fn().mockResolvedValue(
        error ? { error: { message: error } } : { error: null }
    );
    const from = vi.fn().mockReturnValue({ insert });
    const client = { from } as unknown as ReturnType<typeof createAdminClient>;
    return { client, from, insert };
}

describe("writeAuditLog", () => {
    beforeEach(() => vi.clearAllMocks());

    const admin = makeUser("admin", { id: "admin-1", email: "admin@test.com" });

    const baseEntry: AuditInput = {
        actor: admin,
        action: "vendor.approve",
        entity_table: "vendors",
        entity_id: "vendor-1",
        summary: "Approved vendor",
        metadata: { reason: "KYC verified" },
    };

    it("inserts a correctly shaped row", async () => {
        const { client, from, insert } = fakeInsertClient();

        await writeAuditLog(baseEntry, client as any);

        expect(from).toHaveBeenCalledWith("audit_logs");
        expect(insert).toHaveBeenCalledWith({
            actor_id: "admin-1",
            actor_role: "admin",
            action: "vendor.approve",
            entity_table: "vendors",
            entity_id: "vendor-1",
            summary: "Approved vendor",
            metadata: { reason: "KYC verified" },
        });
    });

    it("maps null actor to null actor_id and actor_role", async () => {
        const { client, insert } = fakeInsertClient();
        const systemEntry: AuditInput = {
            actor: null,
            action: "system.cleanup",
            entity_table: "tokens",
        };

        await writeAuditLog(systemEntry, client as any);

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            actor_id: null,
            actor_role: null,
        }));
    });

    it("defaults entity_id to null when omitted", async () => {
        const { client, insert } = fakeInsertClient();
        const entry: AuditInput = {
            actor: admin,
            action: "bulk.operation",
            entity_table: "tokens",
        };

        await writeAuditLog(entry, client as any);

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            entity_id: null,
        }));
    });

    it("defaults summary to null when omitted", async () => {
        const { client, insert } = fakeInsertClient();
        const entry: AuditInput = {
            actor: admin,
            action: "test.action",
            entity_table: "test",
        };

        await writeAuditLog(entry, client as any);

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            summary: null,
        }));
    });

    it("defaults metadata to {} when omitted", async () => {
        const { client, insert } = fakeInsertClient();
        const entry: AuditInput = {
            actor: admin,
            action: "test.action",
            entity_table: "test",
        };

        await writeAuditLog(entry, client as any);

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            metadata: {},
        }));
    });

    it("throws AuditError on DB failure", async () => {
        const { client } = fakeInsertClient("connection refused");

        await expect(writeAuditLog(baseEntry, client as any)).rejects.toThrow(AuditError);
        await expect(writeAuditLog(baseEntry, client as any)).rejects.toThrow(/vendor\.approve/);
    });

    it("uses createAdminClient when no client provided", async () => {
        const { client } = fakeInsertClient();
        createAdminClientMock.mockReturnValue(client as any);

        await writeAuditLog(baseEntry);

        expect(createAdminClientMock).toHaveBeenCalled();
    });

    it("snapshots actor role at action time", async () => {
        const { client, insert } = fakeInsertClient();
        const vendorManager = makeUser("vendor_manager");

        await writeAuditLog({ ...baseEntry, actor: vendorManager }, client as any);

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({
            actor_role: "vendor_manager",
        }));
    });
});

describe("writeAuditLogs (batch)", () => {
    beforeEach(() => vi.clearAllMocks());

    const admin = makeUser("admin", { id: "admin-1" });

    it("inserts multiple rows in one call", async () => {
        const { client, insert } = fakeInsertClient();
        const entries: AuditInput[] = [
            { actor: admin, action: "vendor.approve", entity_table: "vendors", entity_id: "v1" },
            { actor: admin, action: "vendor.approve", entity_table: "vendors", entity_id: "v2" },
            { actor: admin, action: "vendor.approve", entity_table: "vendors", entity_id: "v3" },
        ];

        await writeAuditLogs(entries, client as any);

        expect(insert).toHaveBeenCalledTimes(1);
        const insertedRows = insert.mock.calls[0][0];
        expect(insertedRows).toHaveLength(3);
        expect(insertedRows[0].entity_id).toBe("v1");
        expect(insertedRows[2].entity_id).toBe("v3");
    });

    it("skips insert for empty array", async () => {
        const { client, insert } = fakeInsertClient();

        await writeAuditLogs([], client as any);

        expect(insert).not.toHaveBeenCalled();
    });

    it("throws AuditError on DB failure with count in message", async () => {
        const { client } = fakeInsertClient("disk full");
        const entries: AuditInput[] = [
            { actor: admin, action: "a.1", entity_table: "t" },
            { actor: admin, action: "a.2", entity_table: "t" },
        ];

        await expect(writeAuditLogs(entries, client as any)).rejects.toThrow(AuditError);
        await expect(writeAuditLogs(entries, client as any)).rejects.toThrow(/2 audit_logs rows/);
    });

    it("uses createAdminClient when no client provided", async () => {
        const { client } = fakeInsertClient();
        createAdminClientMock.mockReturnValue(client as any);

        await writeAuditLogs([
            { actor: admin, action: "test", entity_table: "t" },
        ]);

        expect(createAdminClientMock).toHaveBeenCalled();
    });
});

describe("AuditError", () => {
    it("has correct name", () => {
        const err = new AuditError("test");
        expect(err.name).toBe("AuditError");
    });

    it("is an instance of Error", () => {
        const err = new AuditError("test");
        expect(err).toBeInstanceOf(Error);
    });

    it("preserves message", () => {
        const err = new AuditError("something broke");
        expect(err.message).toBe("something broke");
    });
});
