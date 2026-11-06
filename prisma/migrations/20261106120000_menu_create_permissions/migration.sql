ALTER TABLE "admin" ADD COLUMN "role" VARCHAR(20) NOT NULL DEFAULT 'admin';
ALTER TABLE "admin" ADD CONSTRAINT "admin_role_check" CHECK ("role" IN ('admin', 'super_admin'));
ALTER TABLE "tbl_pos_api_credential" ADD COLUMN "menu_create_visibility" JSONB NOT NULL DEFAULT '{}';
