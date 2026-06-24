import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // @vladmandic/human ships a malformed `exports` map whose `node` condition
    // points at human.node.js (needs native @tensorflow/tfjs-node) and whose deep
    // subpaths aren't resolvable. Force the bundled BROWSER ESM build everywhere —
    // it's only ever loaded client-side (dynamic import in <FaceCapture>).
    resolveAlias: {
      "@vladmandic/human": "./node_modules/@vladmandic/human/dist/human.esm.js",
    },
  },
};

export default nextConfig;
