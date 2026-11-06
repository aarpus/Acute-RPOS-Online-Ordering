BEGIN;

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('pickup', 'delivery');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('placed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderTiming" AS ENUM ('asap', 'scheduled');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('pending', 'paid');

-- CreateEnum
CREATE TYPE "OrderOptionType" AS ENUM ('variant', 'modifier', 'combo');

-- CreateEnum
CREATE TYPE "OrderPaymentMethod" AS ENUM ('cash_on_delivery', 'pay_at_pickup');

-- CreateEnum
CREATE TYPE "OrderTransactionStatus" AS ENUM ('pending', 'success', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderActorType" AS ENUM ('customer', 'admin', 'system');

-- CreateEnum
CREATE TYPE "OrderOtpPurpose" AS ENUM ('pickup_handover', 'delivery_handover');

-- CreateEnum
CREATE TYPE "OrderOtpStatus" AS ENUM ('active', 'verified', 'expired', 'revoked');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "order_number" VARCHAR(50) NOT NULL,
    "user_id" UUID NOT NULL,
    "order_type" "OrderType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'placed',
    "customer_name" VARCHAR(150) NOT NULL,
    "customer_phone" VARCHAR(25) NOT NULL,
    "customer_email" VARCHAR(255) NOT NULL,
    "delivery_address" JSONB,
    "delivery_instructions" TEXT,
    "timing" "OrderTiming" NOT NULL DEFAULT 'asap',
    "scheduled_at" TIMESTAMPTZ(6),
    "currency" VARCHAR(3) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "delivery_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(12,2) NOT NULL,
    "payment_status" "OrderPaymentStatus" NOT NULL DEFAULT 'pending',
    "customer_notes" TEXT,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "order_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "item_name" VARCHAR(200) NOT NULL,
    "sku" VARCHAR(100),
    "quantity" INTEGER NOT NULL,
    "base_unit_price" DECIMAL(12,2) NOT NULL,
    "options_unit_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(12,2) NOT NULL,
    "special_instructions" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_options" (
    "id" UUID NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "order_item_id" UUID NOT NULL,
    "option_type" "OrderOptionType" NOT NULL,
    "source_option_id" UUID,
    "group_name" VARCHAR(150),
    "option_name" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "additional_unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_transaction" (
    "id" UUID NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_method" "OrderPaymentMethod" NOT NULL,
    "status" "OrderTransactionStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "transaction_reference" VARCHAR(150),
    "idempotency_key" VARCHAR(100) NOT NULL,
    "collected_by_admin_id" UUID,
    "paid_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_type" "OrderActorType" NOT NULL,
    "actor_user_id" UUID,
    "actor_admin_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_otps" (
    "id" UUID NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "order_id" UUID NOT NULL,
    "purpose" "OrderOtpPurpose" NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "recipient_email" VARCHAR(255) NOT NULL,
    "status" "OrderOtpStatus" NOT NULL DEFAULT 'active',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_sent_at" TIMESTAMPTZ(6),
    "send_count" INTEGER NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMPTZ(6),
    "verified_by_admin_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_store_code_status_created_at_idx" ON "orders"("store_code", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_store_code_user_id_created_at_idx" ON "orders"("store_code", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_code_id_key" ON "orders"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_code_order_number_key" ON "orders"("store_code", "order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_code_idempotency_key_key" ON "orders"("store_code", "idempotency_key");

-- CreateIndex
CREATE INDEX "order_items_store_code_order_id_idx" ON "order_items"("store_code", "order_id");

-- CreateIndex
CREATE INDEX "order_items_store_code_menu_item_id_idx" ON "order_items"("store_code", "menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_store_code_id_key" ON "order_items"("store_code", "id");

-- CreateIndex
CREATE INDEX "order_item_options_store_code_order_item_id_idx" ON "order_item_options"("store_code", "order_item_id");

-- CreateIndex
CREATE INDEX "order_transaction_store_code_order_id_created_at_idx" ON "order_transaction"("store_code", "order_id", "created_at");

-- CreateIndex
CREATE INDEX "order_transaction_store_code_collected_by_admin_id_idx" ON "order_transaction"("store_code", "collected_by_admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_transaction_store_code_idempotency_key_key" ON "order_transaction"("store_code", "idempotency_key");

-- CreateIndex
CREATE INDEX "order_status_history_store_code_order_id_created_at_idx" ON "order_status_history"("store_code", "order_id", "created_at");

-- CreateIndex
CREATE INDEX "order_status_history_store_code_actor_user_id_idx" ON "order_status_history"("store_code", "actor_user_id");

-- CreateIndex
CREATE INDEX "order_status_history_store_code_actor_admin_id_idx" ON "order_status_history"("store_code", "actor_admin_id");

-- CreateIndex
CREATE INDEX "order_otps_store_code_order_id_purpose_status_idx" ON "order_otps"("store_code", "order_id", "purpose", "status");

-- CreateIndex
CREATE INDEX "order_otps_store_code_status_expires_at_idx" ON "order_otps"("store_code", "status", "expires_at");

-- CreateIndex
CREATE INDEX "order_otps_store_code_verified_by_admin_id_idx" ON "order_otps"("store_code", "verified_by_admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_store_code_id_key" ON "users"("store_code", "id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_store_code_id_key" ON "admin"("store_code", "id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_code_user_id_fkey" FOREIGN KEY ("store_code", "user_id") REFERENCES "users"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_store_code_order_id_fkey" FOREIGN KEY ("store_code", "order_id") REFERENCES "orders"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_store_code_menu_item_id_fkey" FOREIGN KEY ("store_code", "menu_item_id") REFERENCES "menu_items"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_store_code_order_item_id_fkey" FOREIGN KEY ("store_code", "order_item_id") REFERENCES "order_items"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_transaction" ADD CONSTRAINT "order_transaction_store_code_order_id_fkey" FOREIGN KEY ("store_code", "order_id") REFERENCES "orders"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_transaction" ADD CONSTRAINT "order_transaction_store_code_collected_by_admin_id_fkey" FOREIGN KEY ("store_code", "collected_by_admin_id") REFERENCES "admin"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_store_code_order_id_fkey" FOREIGN KEY ("store_code", "order_id") REFERENCES "orders"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_store_code_actor_user_id_fkey" FOREIGN KEY ("store_code", "actor_user_id") REFERENCES "users"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_store_code_actor_admin_id_fkey" FOREIGN KEY ("store_code", "actor_admin_id") REFERENCES "admin"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_otps" ADD CONSTRAINT "order_otps_store_code_order_id_fkey" FOREIGN KEY ("store_code", "order_id") REFERENCES "orders"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_otps" ADD CONSTRAINT "order_otps_store_code_verified_by_admin_id_fkey" FOREIGN KEY ("store_code", "verified_by_admin_id") REFERENCES "admin"("store_code", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma does not represent CHECK constraints or partial indexes in its schema.
-- Numeric NaN is explicitly rejected (PostgreSQL considers it greater than zero).
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_nonnegative_amounts" CHECK (
    subtotal >= 0 AND subtotal <> 'NaN'::numeric AND
    discount_amount >= 0 AND discount_amount <> 'NaN'::numeric AND
    tax_amount >= 0 AND tax_amount <> 'NaN'::numeric AND
    delivery_fee >= 0 AND delivery_fee <> 'NaN'::numeric AND
    grand_total >= 0 AND grand_total <> 'NaN'::numeric),
  ADD CONSTRAINT "orders_required_text" CHECK (
    btrim(store_code) <> '' AND btrim(order_number) <> '' AND
    btrim(idempotency_key) <> '' AND btrim(customer_email) <> ''),
  ADD CONSTRAINT "orders_schedule" CHECK (
    (timing = 'asap' AND scheduled_at IS NULL) OR
    (timing = 'scheduled' AND scheduled_at IS NOT NULL)),
  ADD CONSTRAINT "orders_delivery_address" CHECK (
    order_type <> 'delivery' OR
    (delivery_address IS NOT NULL AND jsonb_typeof(delivery_address) = 'object'));

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_positive_quantity" CHECK (quantity > 0),
  ADD CONSTRAINT "order_items_nonnegative_amounts" CHECK (
    base_unit_price >= 0 AND base_unit_price <> 'NaN'::numeric AND
    options_unit_total >= 0 AND options_unit_total <> 'NaN'::numeric AND
    unit_price >= 0 AND unit_price <> 'NaN'::numeric AND
    subtotal >= 0 AND subtotal <> 'NaN'::numeric AND
    discount_amount >= 0 AND discount_amount <> 'NaN'::numeric AND
    tax_amount >= 0 AND tax_amount <> 'NaN'::numeric AND
    line_total >= 0 AND line_total <> 'NaN'::numeric);

ALTER TABLE "order_item_options"
  ADD CONSTRAINT "order_item_options_positive_quantity" CHECK (
    quantity > 0 AND quantity <> 'NaN'::numeric),
  ADD CONSTRAINT "order_item_options_nonnegative_price" CHECK (
    additional_unit_price >= 0 AND additional_unit_price <> 'NaN'::numeric);

ALTER TABLE "order_transaction"
  ADD CONSTRAINT "order_transaction_nonnegative_amount" CHECK (
    amount >= 0 AND amount <> 'NaN'::numeric),
  ADD CONSTRAINT "order_transaction_required_key" CHECK (btrim(idempotency_key) <> '');

ALTER TABLE "order_status_history"
  ADD CONSTRAINT "order_status_history_actor" CHECK (
    (actor_type = 'system' AND actor_user_id IS NULL AND actor_admin_id IS NULL) OR
    (actor_type = 'customer' AND actor_user_id IS NOT NULL AND actor_admin_id IS NULL) OR
    (actor_type = 'admin' AND actor_admin_id IS NOT NULL AND actor_user_id IS NULL));

ALTER TABLE "order_otps"
  ADD CONSTRAINT "order_otps_attempt_limits" CHECK (
    max_attempts > 0 AND attempt_count >= 0 AND attempt_count <= max_attempts),
  ADD CONSTRAINT "order_otps_nonnegative_send_count" CHECK (send_count >= 0),
  ADD CONSTRAINT "order_otps_required_text" CHECK (
    btrim(recipient_email) <> '' AND btrim(otp_hash) <> ''),
  ADD CONSTRAINT "order_otps_expiry" CHECK (expires_at > created_at),
  ADD CONSTRAINT "order_otps_verification" CHECK (
    (status = 'verified' AND verified_at IS NOT NULL AND verified_by_admin_id IS NOT NULL) OR
    (status <> 'verified' AND verified_at IS NULL AND verified_by_admin_id IS NULL));

-- An expired active row must be marked expired/revoked before issuing a new OTP.
-- Time-dependent expiry enforcement and atomic handover belong in the next API step.
CREATE UNIQUE INDEX "order_otps_one_active_per_order_purpose"
ON "order_otps" ("store_code", "order_id", "purpose") WHERE status = 'active';

COMMIT;
