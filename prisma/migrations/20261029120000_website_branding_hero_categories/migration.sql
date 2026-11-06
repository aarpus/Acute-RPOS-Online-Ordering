-- CreateTable
CREATE TABLE "tbl_website_branding" (
    "id" UUID NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "logo_url" TEXT,
    "primary_color" VARCHAR(7) NOT NULL DEFAULT '#7A0E0E',
    "header_color" VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
    "footer_color" VARCHAR(7) NOT NULL DEFAULT '#7A0E0E',
    "accent_color" VARCHAR(7) NOT NULL DEFAULT '#D0021B',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "tbl_website_branding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_hero_banner" (
    "id" UUID NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "external_banner_id" VARCHAR(100),
    "image_url" TEXT NOT NULL,
    "eyebrow" VARCHAR(255),
    "subtitle" TEXT,
    "heading" TEXT,
    "text_color" VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
    "alignment" VARCHAR(10) NOT NULL DEFAULT 'left',
    "overlay_opacity" INTEGER NOT NULL DEFAULT 40,
    "status" INTEGER NOT NULL DEFAULT 1,
    "source" VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
    "sync_batch_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "tbl_hero_banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_website_category" (
    "id" UUID NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "external_category_id" VARCHAR(100),
    "category_name" VARCHAR(150) NOT NULL,
    "image_url" TEXT,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "status" INTEGER NOT NULL DEFAULT 1,
    "source" VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
    "sync_batch_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "tbl_website_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_pos_sync_log" (
    "id" UUID NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "sync_type" VARCHAR(30) NOT NULL,
    "request_id" VARCHAR(100),
    "sync_batch_id" UUID NOT NULL,
    "received_count" INTEGER NOT NULL,
    "inserted_count" INTEGER NOT NULL,
    "deactivated_count" INTEGER NOT NULL,
    "sync_status" VARCHAR(20) NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_pos_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_website_branding_store_code_key" ON "tbl_website_branding"("store_code");

-- CreateIndex
CREATE INDEX "tbl_hero_banner_store_code_status_idx" ON "tbl_hero_banner"("store_code", "status");

-- CreateIndex
CREATE INDEX "tbl_website_category_store_code_status_display_order_idx" ON "tbl_website_category"("store_code", "status", "display_order");

-- CreateIndex
CREATE INDEX "tbl_pos_sync_log_store_code_sync_type_created_at_idx" ON "tbl_pos_sync_log"("store_code", "sync_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_pos_sync_log_store_code_sync_type_request_id_key" ON "tbl_pos_sync_log"("store_code", "sync_type", "request_id");

CREATE UNIQUE INDEX IF NOT EXISTS uq_hero_banner_active_store ON tbl_hero_banner (store_code) WHERE status = 1;
ALTER TABLE tbl_hero_banner ADD CONSTRAINT hero_values CHECK (status IN (0,1) AND source IN ('ADMIN','POS') AND alignment IN ('left','center','right') AND overlay_opacity BETWEEN 0 AND 80 AND text_color ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE tbl_website_category ADD CONSTRAINT category_values CHECK (status IN (0,1) AND source IN ('ADMIN','POS') AND display_order >= 0);
ALTER TABLE tbl_pos_sync_log ADD CONSTRAINT sync_values CHECK (sync_type IN ('HERO_BANNER','CATEGORY') AND sync_status IN ('SUCCESS','FAILED'));
ALTER TABLE tbl_website_branding ADD CONSTRAINT branding_colors CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$' AND header_color ~ '^#[0-9A-Fa-f]{6}$' AND footer_color ~ '^#[0-9A-Fa-f]{6}$' AND accent_color ~ '^#[0-9A-Fa-f]{6}$');
