-- CreateTable
CREATE TABLE "user_addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "shipping_name" VARCHAR(100) NOT NULL,
    "shipping_phone" VARCHAR(25) NOT NULL,
    "flat_house_no" VARCHAR(150) NOT NULL,
    "area_street" VARCHAR(200) NOT NULL,
    "landmark" VARCHAR(150),
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "country" VARCHAR(2) NOT NULL DEFAULT 'US',
    "pincode" VARCHAR(25) NOT NULL,
    "address_type" VARCHAR(20) NOT NULL DEFAULT 'Home',
    "delivery_instructions" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_addresses_user_id_store_code_idx" ON "user_addresses"("user_id", "store_code");

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Exactly one default at most, independently for each customer and store.
CREATE UNIQUE INDEX "user_addresses_one_default_per_user_store"
ON "user_addresses" ("user_id", "store_code") WHERE "is_default" = true;
