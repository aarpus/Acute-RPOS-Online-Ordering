// Legacy cf CLI reference only. Active commands explicitly use Vite + Wrangler.
// Keep this file and its backup until the migration has been verified in production.
import { bindings, defineConfig, defineWorker } from "cf/config";
import { loadEnv } from "vite";

const localEnv = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
// Vite emulates R2 on disk during development; no Cloudflare account or
// production bucket is needed for local uploads.
const brandingBucketName = localEnv.R2_BRANDING_BUCKET || process.env.R2_BRANDING_BUCKET
  || (process.env.NODE_ENV !== "production" ? "online-ordering-branding-local" : "");

export default defineConfig({
  worker: defineWorker({
    name: "online-ordering-web",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-26",
    compatibilityFlags: [
      "nodejs_compat",
      // Vite HMR can reuse Prisma's WASM import promise after its first request
      // has ended. Keep that development import alive across request contexts.
      ...(process.env.NODE_ENV !== "production" ? ["no_handle_cross_request_promise_resolution"] : []),
    ],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
      ...(brandingBucketName ? { BRANDING_IMAGES: bindings.r2({ name: brandingBucketName, dev: { remote: false } }) } : {}),
      COMPANY_CODE: { type: "text", value: localEnv.COMPANY_CODE ?? process.env.COMPANY_CODE ?? "" },
      STORE_CODE: { type: "text", value: localEnv.STORE_CODE ?? process.env.STORE_CODE ?? "" },
      SMTP_HOST: { type: "text", value: process.env.SMTP_HOST ?? "" },
      SMTP_PORT: { type: "text", value: process.env.SMTP_PORT ?? "587" },
      SMTP_SECURE: { type: "text", value: process.env.SMTP_SECURE ?? "false" },
      SMTP_FROM: { type: "text", value: process.env.SMTP_FROM ?? "" },
      SMTP_USER: bindings.secret(),
      SMTP_PASSWORD: bindings.secret(),
      DATABASE_URL: bindings.secret(),
      ADMIN_USER_ID: bindings.secret(),
      EMAIL_VERIFICATION_SECRET: bindings.secret(),
    },
  }),
});

