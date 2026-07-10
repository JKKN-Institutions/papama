/**
 * Test helpers barrel export.
 *
 * Import everything from one place:
 *   import { makeUser, fakeSupabaseClient, makeToken, callRoute } from "@test/helpers";
 */

export {
    fakeSupabaseClient,
    fakeSupabaseSingle,
    fakeSupabaseMultiTable,
    fakeSupabaseWrite,
} from "./mockSupabase";

export {
    makeUser,
    TEST_USERS,
    ALL_ROLES,
    resetUserCounter,
} from "./mockAuth";

export {
    allConfigRows,
    configRow,
    buildConfig,
} from "./mockConfig";

export {
    makeDonor,
    makeCreditTransaction,
    makeDonation,
    makeToken,
    makeTokenDistribution,
    makeBeneficiary,
    makeBeneficiaryRegistration,
    makeVendor,
    makeVendorMenu,
    makeRedemption,
    makeSettlement,
    makeFraudFlag,
    makeAuditLog,
    makeVolunteer,
    makeNotification,
    makeMealWindow,
    makeConfigRow,
    resetFactorySeq,
} from "./factories";

export {
    makeRequest,
    callRoute,
    callGet,
    callPost,
    callPatch,
} from "./routeTestHelper";
