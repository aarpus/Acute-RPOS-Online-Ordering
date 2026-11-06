ALTER TABLE "tbl_website_branding"
ADD COLUMN "nav_alignment" VARCHAR(10) NOT NULL DEFAULT 'left';

ALTER TABLE "tbl_website_branding"
ADD CONSTRAINT "branding_nav_alignment" CHECK (nav_alignment IN ('left', 'center', 'right'));
