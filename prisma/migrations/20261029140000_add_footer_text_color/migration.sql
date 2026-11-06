ALTER TABLE "tbl_website_branding"
ADD COLUMN "footer_text_color" VARCHAR(7) NOT NULL DEFAULT '#FFFFFF';

ALTER TABLE "tbl_website_branding"
ADD CONSTRAINT "branding_footer_text_color" CHECK (footer_text_color ~ '^#[0-9A-Fa-f]{6}$');
