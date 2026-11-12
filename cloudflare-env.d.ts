declare namespace Cloudflare {
  interface Env {
    // Optional until an actual branding bucket is configured. Runtime bindings
    // such as HYPERDRIVE and ASSETS come from worker-configuration.d.ts.
    BRANDING_IMAGES?: R2Bucket;
    EMAIL_VERIFICATION_SECRET: string;
    COMPANY_CODE: string;
    ADMIN_USER_ID: string;
    SMTP_HOST: string;
    SMTP_PORT: string;
    SMTP_SECURE: string;
    SMTP_FROM: string;
    SMTP_USER: string;
    SMTP_PASSWORD: string;
  }
}
