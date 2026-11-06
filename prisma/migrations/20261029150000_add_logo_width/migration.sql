ALTER TABLE "tbl_website_branding" ADD COLUMN "logo_width" INTEGER NOT NULL DEFAULT 56;
ALTER TABLE "tbl_website_branding" ADD CONSTRAINT "branding_logo_width" CHECK (logo_width BETWEEN 24 AND 400);
