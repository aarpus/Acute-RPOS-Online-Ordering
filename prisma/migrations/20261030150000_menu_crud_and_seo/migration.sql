BEGIN;
ALTER TABLE "menu_categories" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_categories_archive_idx" ON "menu_categories" ("store_code", "archived_at");
ALTER TABLE "menu_items" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_items_archive_idx" ON "menu_items" ("store_code", "archived_at");
ALTER TABLE "menu_item_variants" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_item_variants_archive_idx" ON "menu_item_variants" ("store_code", "archived_at");
ALTER TABLE "menu_modifier_groups" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_modifier_groups_archive_idx" ON "menu_modifier_groups" ("store_code", "archived_at");
ALTER TABLE "menu_modifier_options" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_modifier_options_archive_idx" ON "menu_modifier_options" ("store_code", "archived_at");
ALTER TABLE "menu_item_modifier_groups" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_item_modifier_groups_archive_idx" ON "menu_item_modifier_groups" ("store_code", "archived_at");
ALTER TABLE "menu_combo_groups" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_combo_groups_archive_idx" ON "menu_combo_groups" ("store_code", "archived_at");
ALTER TABLE "menu_combo_options" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_combo_options_archive_idx" ON "menu_combo_options" ("store_code", "archived_at");
ALTER TABLE "menu_tax_rules" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_tax_rules_archive_idx" ON "menu_tax_rules" ("store_code", "archived_at");
ALTER TABLE "menu_item_inventory" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_item_inventory_archive_idx" ON "menu_item_inventory" ("store_code", "archived_at");
ALTER TABLE "menu_item_schedules" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_item_schedules_archive_idx" ON "menu_item_schedules" ("store_code", "archived_at");
ALTER TABLE "menu_offers" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_offers_archive_idx" ON "menu_offers" ("store_code", "archived_at");
ALTER TABLE "menu_item_prices" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_item_prices_archive_idx" ON "menu_item_prices" ("store_code", "archived_at");
ALTER TABLE "menu_item_images" ADD COLUMN "archived_at" TIMESTAMPTZ(6), ADD COLUMN "configuration" JSONB;
CREATE INDEX "menu_item_images_archive_idx" ON "menu_item_images" ("store_code", "archived_at");

CREATE TABLE "menu_seo" (
 "id" UUID PRIMARY KEY, "store_code" VARCHAR(50) NOT NULL,
 "target_type" VARCHAR(20) NOT NULL, "target_id" VARCHAR(200) NOT NULL,
 "page_name" VARCHAR(200) NOT NULL, "slug" VARCHAR(250) NOT NULL, "title" VARCHAR(250) NOT NULL,
 "description" TEXT, "keywords" TEXT, "canonical_url" TEXT, "image_url" TEXT,
 "is_active" BOOLEAN NOT NULL DEFAULT true, "archived_at" TIMESTAMPTZ(6), "configuration" JSONB,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "menu_seo_target_check" CHECK ("target_type" IN ('page','item','category') AND length(trim("store_code")) > 0)
);
CREATE UNIQUE INDEX "menu_seo_store_code_id_key" ON "menu_seo" ("store_code", "id");
CREATE INDEX "menu_seo_store_code_target_type_target_id_idx" ON "menu_seo" ("store_code", "target_type", "target_id");
CREATE UNIQUE INDEX "menu_seo_target_unique" ON "menu_seo" ("store_code", "target_type", "target_id") WHERE "archived_at" IS NULL;
CREATE UNIQUE INDEX "menu_seo_slug_unique" ON "menu_seo" ("store_code", lower("slug")) WHERE "archived_at" IS NULL;
DROP INDEX "menu_inventory_item_unique";
DROP INDEX "menu_inventory_variant_unique";
CREATE UNIQUE INDEX "menu_inventory_item_unique" ON "menu_item_inventory" ("store_code", "menu_item_id") WHERE "variant_id" IS NULL AND "archived_at" IS NULL;
CREATE UNIQUE INDEX "menu_inventory_variant_unique" ON "menu_item_inventory" ("store_code", "menu_item_id", "variant_id") WHERE "variant_id" IS NOT NULL AND "archived_at" IS NULL;
DROP INDEX "menu_modifier_assignment_item_unique";
DROP INDEX "menu_modifier_assignment_variant_unique";
CREATE UNIQUE INDEX "menu_modifier_assignment_item_unique" ON "menu_item_modifier_groups" ("store_code", "menu_item_id", "modifier_group_id") WHERE "variant_id" IS NULL AND "archived_at" IS NULL;
CREATE UNIQUE INDEX "menu_modifier_assignment_variant_unique" ON "menu_item_modifier_groups" ("store_code", "menu_item_id", "modifier_group_id", "variant_id") WHERE "variant_id" IS NOT NULL AND "archived_at" IS NULL;
COMMIT;
