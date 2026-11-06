BEGIN;
ALTER TABLE "orders"
  ADD COLUMN "checkout_request_hash" VARCHAR(64),
  ADD COLUMN "store_snapshot" JSONB,
  ADD COLUMN "confirmation_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "confirmation_attempt_at" TIMESTAMPTZ(6);
ALTER TABLE "order_items"
  ADD COLUMN "item_image_url" TEXT,
  ADD COLUMN "inventory_allocations" JSONB;
ALTER TABLE "order_item_options" ADD COLUMN "selection_key" VARCHAR(150);
COMMIT;
