CREATE TABLE "admin" (
    "id" UUID NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_store_code_email_key" ON "admin"("store_code", "email");
