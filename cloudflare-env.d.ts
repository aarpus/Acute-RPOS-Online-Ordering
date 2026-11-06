declare namespace Cloudflare {
  interface Env {
    DATABASE_URL: string;
    BRANDING_IMAGES?: {
      put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
      get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
    };
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
