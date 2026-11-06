CREATE TABLE "tbl_pos_api_credential" (
 "id" UUID NOT NULL PRIMARY KEY,
 "store_code" VARCHAR(50) NOT NULL,
 "token_hash" VARCHAR(64) NOT NULL,
 "is_active" BOOLEAN NOT NULL DEFAULT true,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(6) NOT NULL,
 "created_by" UUID,
 "updated_by" UUID
);
CREATE UNIQUE INDEX "tbl_pos_api_credential_store_code_key" ON "tbl_pos_api_credential"("store_code");
CREATE UNIQUE INDEX "tbl_pos_api_credential_token_hash_key" ON "tbl_pos_api_credential"("token_hash");
