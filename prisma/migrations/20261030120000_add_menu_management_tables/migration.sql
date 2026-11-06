BEGIN;

-- CreateTable
CREATE TABLE "menu_sync_logs" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "request_id" VARCHAR(100) NOT NULL,
    "schema_version" VARCHAR(20) NOT NULL,
    "sync_type" VARCHAR(20) NOT NULL,
    "catalog_version" BIGINT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "records_received" INTEGER NOT NULL DEFAULT 0,
    "records_processed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "external_category_id" VARCHAR(100),
    "category_name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "external_item_id" VARCHAR(100),
    "sku" VARCHAR(100),
    "item_name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "item_type" VARCHAR(30) NOT NULL DEFAULT 'regular',
    "food_type" VARCHAR(30),
    "base_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "compare_price" DECIMAL(12,2),
    "tax_rule_id" UUID,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "preparation_time" INTEGER,
    "allow_special_instructions" BOOLEAN NOT NULL DEFAULT true,
    "special_instructions_max_length" INTEGER NOT NULL DEFAULT 250,
    "minimum_quantity" INTEGER NOT NULL DEFAULT 1,
    "maximum_quantity" INTEGER,
    "nutrition_info" JSONB,
    "allergens" JSONB,
    "tags" JSONB,
    "metadata" JSONB,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_categories" (
    "store_code" VARCHAR(50) NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_item_categories_pkey" PRIMARY KEY ("store_code","menu_item_id","category_id")
);

-- CreateTable
CREATE TABLE "menu_item_variants" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "external_variant_id" VARCHAR(100),
    "name" VARCHAR(150) NOT NULL,
    "sku" VARCHAR(100),
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "compare_price" DECIMAL(12,2),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "inventory_quantity" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'manual',

    CONSTRAINT "menu_item_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_modifier_groups" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "external_group_id" VARCHAR(100),
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "selection_type" VARCHAR(20) NOT NULL DEFAULT 'single',
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "rules" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "allow_option_quantity" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "menu_modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_modifier_options" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "modifier_group_id" UUID NOT NULL,
    "external_option_id" VARCHAR(100),
    "name" VARCHAR(150) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "min_quantity" INTEGER NOT NULL DEFAULT 0,
    "max_quantity" INTEGER NOT NULL DEFAULT 1,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "linked_item_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'manual',

    CONSTRAINT "menu_modifier_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_modifier_groups" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "modifier_group_id" UUID NOT NULL,
    "variant_id" UUID,
    "is_required_override" BOOLEAN,
    "min_select_override" INTEGER,
    "max_select_override" INTEGER,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_item_modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_combo_groups" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "combo_item_id" UUID NOT NULL,
    "external_group_id" VARCHAR(100),
    "group_name" VARCHAR(150) NOT NULL,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "rules" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "selection_type" VARCHAR(20) NOT NULL DEFAULT 'selectable',

    CONSTRAINT "menu_combo_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_combo_options" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "combo_group_id" UUID NOT NULL,
    "external_option_id" VARCHAR(100),
    "component_item_id" UUID,
    "external_component_item_id" VARCHAR(100),
    "option_name" VARCHAR(150) NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "extra_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'manual',

    CONSTRAINT "menu_combo_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_tax_rules" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "external_tax_id" VARCHAR(100),
    "name" VARCHAR(150) NOT NULL,
    "rate_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "price_includes_tax" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "tax_components" JSONB,
    "calculation_rules" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'manual',

    CONSTRAINT "menu_tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_inventory" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "variant_id" UUID,
    "track_inventory" BOOLEAN NOT NULL DEFAULT false,
    "quantity_available" DECIMAL(12,3),
    "low_stock_threshold" DECIMAL(12,3),
    "allow_backorder" BOOLEAN NOT NULL DEFAULT false,
    "stock_status" VARCHAR(30) NOT NULL DEFAULT 'in_stock',
    "last_stock_sync_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_item_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_schedules" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "timezone" VARCHAR(100) NOT NULL,
    "days_of_week" JSONB,
    "start_time" TIME(6),
    "end_time" TIME(6),
    "start_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "schedule_type" VARCHAR(30) NOT NULL DEFAULT 'recurring',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_item_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_offers" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "external_offer_id" VARCHAR(100),
    "offer_code" VARCHAR(100),
    "offer_name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "offer_type" VARCHAR(50) NOT NULL,
    "discount_value" DECIMAL(12,2),
    "max_discount" DECIMAL(12,2),
    "minimum_order" DECIMAL(12,2),
    "coupon_required" BOOLEAN NOT NULL DEFAULT false,
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_stackable" BOOLEAN NOT NULL DEFAULT false,
    "usage_limit" INTEGER,
    "per_customer_limit" INTEGER,
    "applicable_channels" JSONB,
    "applicable_items" JSONB,
    "applicable_categories" JSONB,
    "conditions" JSONB,
    "rewards" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_offer_usage" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "customer_id" UUID,
    "order_id" UUID,
    "coupon_code" VARCHAR(100),
    "discount_amount" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'redeemed',
    "used_at" TIMESTAMPTZ(6),
    "reversed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_offer_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_prices" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "variant_id" UUID,
    "price_type" VARCHAR(30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "compare_price" DECIMAL(12,2),
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'manual',

    CONSTRAINT "menu_item_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_images" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "external_image_id" VARCHAR(100),
    "image_url" TEXT NOT NULL,
    "alt_text" VARCHAR(250),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'manual',

    CONSTRAINT "menu_item_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_sync_settings" (
    "store_code" VARCHAR(50) NOT NULL,
    "id" UUID NOT NULL,
    "pos_sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sync_mode" VARCHAR(30) NOT NULL DEFAULT 'full_and_delta',
    "current_catalog_version" BIGINT NOT NULL DEFAULT 0,
    "last_sync_at" TIMESTAMPTZ(6),
    "last_successful_sync_at" TIMESTAMPTZ(6),
    "manual_items_protected" BOOLEAN NOT NULL DEFAULT true,
    "auto_publish" BOOLEAN NOT NULL DEFAULT false,
    "allow_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "conflict_resolution" VARCHAR(30) NOT NULL DEFAULT 'pos_wins',
    "sync_config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_sync_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_sync_logs_store_code_status_received_at_idx" ON "menu_sync_logs"("store_code", "status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "menu_sync_logs_store_code_id_key" ON "menu_sync_logs"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_sync_logs_store_code_request_id_key" ON "menu_sync_logs"("store_code", "request_id");

-- CreateIndex
CREATE INDEX "menu_categories_store_code_is_visible_display_order_idx" ON "menu_categories"("store_code", "is_visible", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_store_code_id_key" ON "menu_categories"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_store_code_external_category_id_key" ON "menu_categories"("store_code", "external_category_id");

-- CreateIndex
CREATE INDEX "menu_items_store_code_tax_rule_id_idx" ON "menu_items"("store_code", "tax_rule_id");

-- CreateIndex
CREATE INDEX "menu_items_store_code_is_visible_is_available_display_order_idx" ON "menu_items"("store_code", "is_visible", "is_available", "display_order");

-- CreateIndex
CREATE INDEX "menu_items_store_code_sku_idx" ON "menu_items"("store_code", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_store_code_id_key" ON "menu_items"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_store_code_external_item_id_key" ON "menu_items"("store_code", "external_item_id");

-- CreateIndex
CREATE INDEX "menu_item_categories_store_code_menu_item_id_idx" ON "menu_item_categories"("store_code", "menu_item_id");

-- CreateIndex
CREATE INDEX "menu_item_categories_store_code_category_id_idx" ON "menu_item_categories"("store_code", "category_id");

-- CreateIndex
CREATE INDEX "menu_item_variants_store_code_menu_item_id_idx" ON "menu_item_variants"("store_code", "menu_item_id");

-- CreateIndex
CREATE INDEX "menu_item_variants_store_code_menu_item_id_is_available_dis_idx" ON "menu_item_variants"("store_code", "menu_item_id", "is_available", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_variants_store_code_id_key" ON "menu_item_variants"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_variants_store_code_external_variant_id_key" ON "menu_item_variants"("store_code", "external_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_variants_store_code_menu_item_id_id_key" ON "menu_item_variants"("store_code", "menu_item_id", "id");

-- CreateIndex
CREATE INDEX "menu_modifier_groups_store_code_is_active_display_order_idx" ON "menu_modifier_groups"("store_code", "is_active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "menu_modifier_groups_store_code_id_key" ON "menu_modifier_groups"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_modifier_groups_store_code_external_group_id_key" ON "menu_modifier_groups"("store_code", "external_group_id");

-- CreateIndex
CREATE INDEX "menu_modifier_options_store_code_modifier_group_id_idx" ON "menu_modifier_options"("store_code", "modifier_group_id");

-- CreateIndex
CREATE INDEX "menu_modifier_options_store_code_linked_item_id_idx" ON "menu_modifier_options"("store_code", "linked_item_id");

-- CreateIndex
CREATE INDEX "menu_modifier_options_store_code_modifier_group_id_is_avail_idx" ON "menu_modifier_options"("store_code", "modifier_group_id", "is_available", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "menu_modifier_options_store_code_id_key" ON "menu_modifier_options"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_modifier_options_store_code_external_option_id_key" ON "menu_modifier_options"("store_code", "external_option_id");

-- CreateIndex
CREATE INDEX "menu_item_modifier_groups_store_code_menu_item_id_idx" ON "menu_item_modifier_groups"("store_code", "menu_item_id");

-- CreateIndex
CREATE INDEX "menu_item_modifier_groups_store_code_modifier_group_id_idx" ON "menu_item_modifier_groups"("store_code", "modifier_group_id");

-- CreateIndex
CREATE INDEX "menu_item_modifier_groups_store_code_menu_item_id_variant_i_idx" ON "menu_item_modifier_groups"("store_code", "menu_item_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_modifier_groups_store_code_id_key" ON "menu_item_modifier_groups"("store_code", "id");

-- CreateIndex
CREATE INDEX "menu_combo_groups_store_code_combo_item_id_idx" ON "menu_combo_groups"("store_code", "combo_item_id");

-- CreateIndex
CREATE INDEX "menu_combo_groups_store_code_combo_item_id_display_order_idx" ON "menu_combo_groups"("store_code", "combo_item_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "menu_combo_groups_store_code_id_key" ON "menu_combo_groups"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_combo_groups_store_code_external_group_id_key" ON "menu_combo_groups"("store_code", "external_group_id");

-- CreateIndex
CREATE INDEX "menu_combo_options_store_code_combo_group_id_idx" ON "menu_combo_options"("store_code", "combo_group_id");

-- CreateIndex
CREATE INDEX "menu_combo_options_store_code_component_item_id_idx" ON "menu_combo_options"("store_code", "component_item_id");

-- CreateIndex
CREATE INDEX "menu_combo_options_store_code_combo_group_id_is_available_d_idx" ON "menu_combo_options"("store_code", "combo_group_id", "is_available", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "menu_combo_options_store_code_id_key" ON "menu_combo_options"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_combo_options_store_code_external_option_id_key" ON "menu_combo_options"("store_code", "external_option_id");

-- CreateIndex
CREATE INDEX "menu_tax_rules_store_code_is_active_idx" ON "menu_tax_rules"("store_code", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "menu_tax_rules_store_code_id_key" ON "menu_tax_rules"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_tax_rules_store_code_external_tax_id_key" ON "menu_tax_rules"("store_code", "external_tax_id");

-- CreateIndex
CREATE INDEX "menu_item_inventory_store_code_menu_item_id_idx" ON "menu_item_inventory"("store_code", "menu_item_id");

-- CreateIndex
CREATE INDEX "menu_item_inventory_store_code_menu_item_id_variant_id_idx" ON "menu_item_inventory"("store_code", "menu_item_id", "variant_id");

-- CreateIndex
CREATE INDEX "menu_item_inventory_store_code_stock_status_idx" ON "menu_item_inventory"("store_code", "stock_status");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_inventory_store_code_id_key" ON "menu_item_inventory"("store_code", "id");

-- CreateIndex
CREATE INDEX "menu_item_schedules_store_code_menu_item_id_idx" ON "menu_item_schedules"("store_code", "menu_item_id");

-- CreateIndex
CREATE INDEX "menu_item_schedules_store_code_menu_item_id_is_active_idx" ON "menu_item_schedules"("store_code", "menu_item_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_schedules_store_code_id_key" ON "menu_item_schedules"("store_code", "id");

-- CreateIndex
CREATE INDEX "menu_offers_store_code_is_active_start_at_end_at_idx" ON "menu_offers"("store_code", "is_active", "start_at", "end_at");

-- CreateIndex
CREATE UNIQUE INDEX "menu_offers_store_code_id_key" ON "menu_offers"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_offers_store_code_external_offer_id_key" ON "menu_offers"("store_code", "external_offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_offers_store_code_offer_code_key" ON "menu_offers"("store_code", "offer_code");

-- CreateIndex
CREATE INDEX "menu_offer_usage_store_code_offer_id_idx" ON "menu_offer_usage"("store_code", "offer_id");

-- CreateIndex
CREATE INDEX "menu_offer_usage_store_code_offer_id_customer_id_status_idx" ON "menu_offer_usage"("store_code", "offer_id", "customer_id", "status");

-- CreateIndex
CREATE INDEX "menu_offer_usage_store_code_order_id_idx" ON "menu_offer_usage"("store_code", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_offer_usage_store_code_id_key" ON "menu_offer_usage"("store_code", "id");

-- CreateIndex
CREATE INDEX "menu_item_prices_store_code_menu_item_id_idx" ON "menu_item_prices"("store_code", "menu_item_id");

-- CreateIndex
CREATE INDEX "menu_item_prices_store_code_menu_item_id_variant_id_idx" ON "menu_item_prices"("store_code", "menu_item_id", "variant_id");

-- CreateIndex
CREATE INDEX "menu_item_prices_store_code_menu_item_id_price_type_currenc_idx" ON "menu_item_prices"("store_code", "menu_item_id", "price_type", "currency", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_prices_store_code_id_key" ON "menu_item_prices"("store_code", "id");

-- CreateIndex
CREATE INDEX "menu_item_images_store_code_menu_item_id_idx" ON "menu_item_images"("store_code", "menu_item_id");

-- CreateIndex
CREATE INDEX "menu_item_images_store_code_menu_item_id_is_active_display__idx" ON "menu_item_images"("store_code", "menu_item_id", "is_active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_images_store_code_id_key" ON "menu_item_images"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_images_store_code_external_image_id_key" ON "menu_item_images"("store_code", "external_image_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_sync_settings_store_code_id_key" ON "menu_sync_settings"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_sync_settings_store_code_key" ON "menu_sync_settings"("store_code");

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_store_code_tax_rule_id_fkey" FOREIGN KEY ("store_code", "tax_rule_id") REFERENCES "menu_tax_rules"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_categories" ADD CONSTRAINT "menu_item_categories_store_code_menu_item_id_fkey" FOREIGN KEY ("store_code", "menu_item_id") REFERENCES "menu_items"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_categories" ADD CONSTRAINT "menu_item_categories_store_code_category_id_fkey" FOREIGN KEY ("store_code", "category_id") REFERENCES "menu_categories"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_item_variants_store_code_menu_item_id_fkey" FOREIGN KEY ("store_code", "menu_item_id") REFERENCES "menu_items"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_modifier_options" ADD CONSTRAINT "menu_modifier_options_store_code_modifier_group_id_fkey" FOREIGN KEY ("store_code", "modifier_group_id") REFERENCES "menu_modifier_groups"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_modifier_options" ADD CONSTRAINT "menu_modifier_options_store_code_linked_item_id_fkey" FOREIGN KEY ("store_code", "linked_item_id") REFERENCES "menu_items"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_store_code_menu_item_id_fkey" FOREIGN KEY ("store_code", "menu_item_id") REFERENCES "menu_items"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_store_code_modifier_group_id_fkey" FOREIGN KEY ("store_code", "modifier_group_id") REFERENCES "menu_modifier_groups"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_store_code_menu_item_id_variant__fkey" FOREIGN KEY ("store_code", "menu_item_id", "variant_id") REFERENCES "menu_item_variants"("store_code", "menu_item_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_combo_groups" ADD CONSTRAINT "menu_combo_groups_store_code_combo_item_id_fkey" FOREIGN KEY ("store_code", "combo_item_id") REFERENCES "menu_items"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_combo_options" ADD CONSTRAINT "menu_combo_options_store_code_combo_group_id_fkey" FOREIGN KEY ("store_code", "combo_group_id") REFERENCES "menu_combo_groups"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_combo_options" ADD CONSTRAINT "menu_combo_options_store_code_component_item_id_fkey" FOREIGN KEY ("store_code", "component_item_id") REFERENCES "menu_items"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_inventory" ADD CONSTRAINT "menu_item_inventory_store_code_menu_item_id_fkey" FOREIGN KEY ("store_code", "menu_item_id") REFERENCES "menu_items"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_inventory" ADD CONSTRAINT "menu_item_inventory_store_code_menu_item_id_variant_id_fkey" FOREIGN KEY ("store_code", "menu_item_id", "variant_id") REFERENCES "menu_item_variants"("store_code", "menu_item_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_schedules" ADD CONSTRAINT "menu_item_schedules_store_code_menu_item_id_fkey" FOREIGN KEY ("store_code", "menu_item_id") REFERENCES "menu_items"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_offer_usage" ADD CONSTRAINT "menu_offer_usage_store_code_offer_id_fkey" FOREIGN KEY ("store_code", "offer_id") REFERENCES "menu_offers"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_prices" ADD CONSTRAINT "menu_item_prices_store_code_menu_item_id_fkey" FOREIGN KEY ("store_code", "menu_item_id") REFERENCES "menu_items"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_prices" ADD CONSTRAINT "menu_item_prices_store_code_menu_item_id_variant_id_fkey" FOREIGN KEY ("store_code", "menu_item_id", "variant_id") REFERENCES "menu_item_variants"("store_code", "menu_item_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_images" ADD CONSTRAINT "menu_item_images_store_code_menu_item_id_fkey" FOREIGN KEY ("store_code", "menu_item_id") REFERENCES "menu_items"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- PostgreSQL-only invariants. Prisma 6 does not model CHECK or partial/expression
-- indexes; preserve this section when making future migrations.
CREATE UNIQUE INDEX "menu_inventory_item_unique"
    ON "menu_item_inventory" ("store_code", "menu_item_id") WHERE "variant_id" IS NULL;
CREATE UNIQUE INDEX "menu_inventory_variant_unique"
    ON "menu_item_inventory" ("store_code", "menu_item_id", "variant_id") WHERE "variant_id" IS NOT NULL;
CREATE UNIQUE INDEX "menu_modifier_assignment_item_unique"
    ON "menu_item_modifier_groups" ("store_code", "menu_item_id", "modifier_group_id") WHERE "variant_id" IS NULL;
CREATE UNIQUE INDEX "menu_modifier_assignment_variant_unique"
    ON "menu_item_modifier_groups" ("store_code", "menu_item_id", "modifier_group_id", "variant_id") WHERE "variant_id" IS NOT NULL;
CREATE UNIQUE INDEX "menu_image_primary_unique"
    ON "menu_item_images" ("store_code", "menu_item_id") WHERE "is_primary" AND "is_active";
CREATE UNIQUE INDEX "menu_variant_default_unique"
    ON "menu_item_variants" ("store_code", "menu_item_id") WHERE "is_default";

-- Reject duplicate active price windows at the same priority, including NULL
-- variant/window endpoints. Overlapping distinct windows require serialized
-- application validation; see prisma/MENU-MANAGEMENT.md.
CREATE UNIQUE INDEX "menu_price_item_window_unique"
    ON "menu_item_prices" ("store_code", "menu_item_id", "price_type", "currency", "priority",
        COALESCE("start_at", '-infinity'::timestamptz), COALESCE("end_at", 'infinity'::timestamptz))
    WHERE "is_active" AND "variant_id" IS NULL;
CREATE UNIQUE INDEX "menu_price_variant_window_unique"
    ON "menu_item_prices" ("store_code", "menu_item_id", "variant_id", "price_type", "currency", "priority",
        COALESCE("start_at", '-infinity'::timestamptz), COALESCE("end_at", 'infinity'::timestamptz))
    WHERE "is_active" AND "variant_id" IS NOT NULL;

ALTER TABLE "menu_sync_logs" ADD CONSTRAINT "menu_sync_log_values" CHECK (
    "sync_type" IN ('full', 'delta') AND "status" IN ('pending', 'processing', 'success', 'failed')
    AND "records_received" >= 0 AND "records_processed" >= 0
    AND ("catalog_version" IS NULL OR "catalog_version" >= 0)
    AND ("completed_at" IS NULL OR "completed_at" >= "received_at"));
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_category_values" CHECK (
    "source_type" IN ('manual', 'pos') AND "display_order" >= 0);
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_item_values" CHECK (
    "source_type" IN ('manual', 'pos') AND "item_type" IN ('regular', 'combo')
    AND ("food_type" IS NULL OR "food_type" IN ('veg', 'non_veg', 'vegan', 'egg'))
    AND "base_price" >= 0 AND ("compare_price" IS NULL OR "compare_price" >= 0)
    AND "minimum_quantity" >= 1 AND ("maximum_quantity" IS NULL OR "maximum_quantity" >= "minimum_quantity")
    AND ("preparation_time" IS NULL OR "preparation_time" >= 0)
    AND "special_instructions_max_length" >= 0 AND "display_order" >= 0);
ALTER TABLE "menu_item_categories" ADD CONSTRAINT "menu_category_link_values" CHECK ("display_order" >= 0);
ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_variant_values" CHECK (
    "source_type" IN ('manual', 'pos') AND "price" >= 0
    AND ("compare_price" IS NULL OR "compare_price" >= 0) AND "display_order" >= 0);
ALTER TABLE "menu_modifier_groups" ADD CONSTRAINT "menu_modifier_group_values" CHECK (
    "source_type" IN ('manual', 'pos') AND "selection_type" IN ('single', 'multiple')
    AND "min_select" >= 0 AND "max_select" >= "min_select"
    AND ("selection_type" <> 'single' OR "max_select" = 1) AND "display_order" >= 0);
ALTER TABLE "menu_modifier_options" ADD CONSTRAINT "menu_modifier_option_values" CHECK (
    "source_type" IN ('manual', 'pos') AND "price" >= 0
    AND "min_quantity" >= 0 AND "max_quantity" >= "min_quantity" AND "display_order" >= 0);
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_modifier_assignment_values" CHECK (
    ("min_select_override" IS NULL OR "min_select_override" >= 0)
    AND ("max_select_override" IS NULL OR "max_select_override" >= 0)
    AND ("min_select_override" IS NULL OR "max_select_override" IS NULL OR "max_select_override" >= "min_select_override")
    AND "display_order" >= 0);
ALTER TABLE "menu_combo_groups" ADD CONSTRAINT "menu_combo_group_values" CHECK (
    "source_type" IN ('manual', 'pos') AND "selection_type" IN ('fixed', 'selectable')
    AND "min_select" >= 0 AND "max_select" >= "min_select" AND "display_order" >= 0
    AND (NOT "is_required" OR "min_select" > 0));
ALTER TABLE "menu_combo_options" ADD CONSTRAINT "menu_combo_option_values" CHECK (
    "source_type" IN ('manual', 'pos') AND "quantity" > 0 AND "extra_price" >= 0 AND "display_order" >= 0);
ALTER TABLE "menu_tax_rules" ADD CONSTRAINT "menu_tax_rule_values" CHECK (
    "source_type" IN ('manual', 'pos') AND "rate_percent" BETWEEN 0 AND 100);
ALTER TABLE "menu_item_inventory" ADD CONSTRAINT "menu_inventory_values" CHECK (
    ("low_stock_threshold" IS NULL OR "low_stock_threshold" >= 0)
    AND (NOT "track_inventory" OR "quantity_available" IS NOT NULL)
    AND ("allow_backorder" OR "quantity_available" IS NULL OR "quantity_available" >= 0)
    AND "stock_status" IN ('in_stock', 'low_stock', 'out_of_stock', 'backorder'));
ALTER TABLE "menu_item_schedules" ADD CONSTRAINT "menu_schedule_values" CHECK (
    ("start_date" IS NULL OR "end_date" IS NULL OR "end_date" >= "start_date")
    AND (("start_time" IS NULL) = ("end_time" IS NULL))
    AND "schedule_type" IN ('recurring', 'date_range', 'exception')
    AND ("days_of_week" IS NULL OR (jsonb_typeof("days_of_week") = 'array'
        AND "days_of_week" <@ '[1,2,3,4,5,6,7]'::jsonb)));
ALTER TABLE "menu_offers" ADD CONSTRAINT "menu_offer_values" CHECK (
    "source_type" IN ('manual', 'pos')
    AND "offer_type" IN ('percentage', 'fixed', 'bogo', 'buy_x_get_y', 'combo_discount',
        'category_discount', 'product_discount', 'variant_discount', 'coupon', 'first_order',
        'minimum_cart', 'free_delivery', 'happy_hour', 'scheduled', 'customer_specific')
    AND ("discount_value" IS NULL OR "discount_value" >= 0)
    AND ("offer_type" <> 'percentage' OR ("discount_value" IS NOT NULL AND "discount_value" BETWEEN 0 AND 100))
    AND ("max_discount" IS NULL OR "max_discount" >= 0)
    AND ("minimum_order" IS NULL OR "minimum_order" >= 0)
    AND ("usage_limit" IS NULL OR "usage_limit" >= 0)
    AND ("per_customer_limit" IS NULL OR "per_customer_limit" >= 0)
    AND (NOT "coupon_required" OR ("offer_code" IS NOT NULL AND length(trim("offer_code")) > 0))
    AND ("start_at" IS NULL OR "end_at" IS NULL OR "end_at" > "start_at"));
ALTER TABLE "menu_offer_usage" ADD CONSTRAINT "menu_offer_usage_values" CHECK (
    "discount_amount" >= 0 AND "status" IN ('reserved', 'redeemed', 'reversed', 'cancelled')
    AND ("used_at" IS NULL OR "reversed_at" IS NULL OR "reversed_at" >= "used_at"));
ALTER TABLE "menu_item_prices" ADD CONSTRAINT "menu_price_values" CHECK (
    "source_type" IN ('manual', 'pos') AND "price" >= 0
    AND ("compare_price" IS NULL OR "compare_price" >= 0)
    AND "currency" ~ '^[A-Z]{3}$'
    AND "price_type" IN ('base', 'variant', 'online', 'pickup', 'delivery', 'dine_in', 'scheduled')
    AND ("price_type" <> 'variant' OR "variant_id" IS NOT NULL)
    AND ("price_type" <> 'scheduled' OR "start_at" IS NOT NULL OR "end_at" IS NOT NULL)
    AND ("start_at" IS NULL OR "end_at" IS NULL OR "end_at" > "start_at"));
ALTER TABLE "menu_item_images" ADD CONSTRAINT "menu_image_values" CHECK (
    "source_type" IN ('manual', 'pos') AND "display_order" >= 0);
ALTER TABLE "menu_sync_settings" ADD CONSTRAINT "menu_sync_setting_values" CHECK (
    "manual_items_protected" AND "current_catalog_version" >= 0
    AND "sync_mode" IN ('full', 'delta', 'full_and_delta')
    AND "conflict_resolution" IN ('pos_wins', 'manual_wins', 'newest_wins'));

-- Tenant keys cannot be empty or whitespace. No Store foreign key is created.
DO $$
DECLARE menu_table text;
BEGIN
    FOREACH menu_table IN ARRAY ARRAY[
        'menu_sync_logs', 'menu_categories', 'menu_items', 'menu_item_categories',
        'menu_item_variants', 'menu_modifier_groups', 'menu_modifier_options',
        'menu_item_modifier_groups', 'menu_combo_groups', 'menu_combo_options',
        'menu_tax_rules', 'menu_item_inventory', 'menu_item_schedules', 'menu_offers',
        'menu_offer_usage', 'menu_item_prices', 'menu_item_images', 'menu_sync_settings']
    LOOP
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (length(trim(store_code)) > 0)',
            menu_table, menu_table || '_store_code_nonempty');
    END LOOP;
END $$;

COMMIT;
