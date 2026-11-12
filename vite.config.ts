import { defineConfig, loadEnv } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import { resolve } from "node:path";
import { responseStoreAdapter } from "@vinext/cloudflare/cache/response-store-adapter";

export default defineConfig(({ command, mode }) => {
  const localEnv = loadEnv(mode, process.cwd(), "");
  // The external cache service requires R2. Enable it only after that service
  // has been provisioned; keep ordinary application deployment independent.
  const responseStoreEnabled = localEnv.RPOS_RESPONSE_STORE_ENABLED === "true";
  // Hyperdrive emulation needs an explicit local connection. Keep the URL in
  // process memory, never in the generated production Wrangler configuration.
  if (command === "serve" && localEnv.DATABASE_URL) {
    process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??= localEnv.DATABASE_URL;
  }
  return {
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
      cache: responseStoreEnabled ? responseStoreAdapter({ mode: "service-binding" }) : undefined,
    }),
    cloudflare({
      configPath: "./wrangler.jsonc",
      // Run the existing cache service locally, with emulated storage only.
      auxiliaryWorkers: responseStoreEnabled
        ? [{ configPath: "./wrangler.response-store.jsonc", devOnly: true }]
        : [],
      config: {
        services: responseStoreEnabled ? [{
          binding: "RESPONSE_STORE",
          service: "rpos-online-ordering-response-store",
          entrypoint: "ResponseStoreService",
        }] : [],
        ...(command === "serve" ? { vars: Object.fromEntries(
          ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_FROM", "COMPANY_CODE", "STORE_CODE", "ADMIN_USER_ID"]
            .filter(key => localEnv[key] !== undefined)
            .map(key => [key, localEnv[key]]),
        ) } : {}),
      },
      persistState: true,
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
  };
});
