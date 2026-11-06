import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import { resolve } from "node:path";

export default defineConfig({
  // The Node client reads its query compiler from the filesystem, which does
  // not exist inside a deployed Worker. Use Prisma's generated Worker client
  // for all runtime Prisma imports so null sentinels share the same runtime.
  resolve: { alias: [{ find: /^@prisma\/client$/, replacement: resolve("node_modules/.prisma/client/wasm.js") }] },
  // Prisma generates its client inside node_modules. Refresh the dependency
  // cache on startup/config restart so new models don't use an older client.
  // After `prisma generate`, restart dev to refresh both rsc and ssr clients.
  optimizeDeps: { force: true },
  plugins: [
    vinext({
      images: { optimizer: imagesOptimizer() },
    }),
    cloudflare({
      persistState: true,
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
