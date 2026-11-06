ALTER TABLE "tbl_pos_sync_log" DROP CONSTRAINT "sync_values";
ALTER TABLE "tbl_pos_sync_log" ADD CONSTRAINT "sync_values" CHECK (
  "sync_type" IN ('HERO_BANNER', 'CATEGORY', 'MENU_CATEGORY', 'MENU_TAX_RULE')
  AND "sync_status" IN ('SUCCESS', 'FAILED')
);
