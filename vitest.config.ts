import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            // `server-only` throws outside a server bundle — stub it for node tests.
            "server-only": path.resolve(__dirname, "test/stubs/empty.ts"),
            // Mirror the tsconfig "@/*" path alias.
            "@": path.resolve(__dirname),
            // Test helpers alias.
            "@test": path.resolve(__dirname, "test"),
        },
    },
    test: {
        environment: "node",
        include: ["test/**/*.test.ts"],
    },
});
