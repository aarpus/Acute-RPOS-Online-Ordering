BEGIN;
-- Admin login codes identify the company, not necessarily an individual store.
-- The handlers authorize tbl_store.company_code before every order read/write.
ALTER TABLE "order_transaction" DROP CONSTRAINT "order_transaction_store_code_collected_by_admin_id_fkey";
ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_store_code_actor_admin_id_fkey";
ALTER TABLE "order_otps" DROP CONSTRAINT "order_otps_store_code_verified_by_admin_id_fkey";
ALTER TABLE "order_transaction" ADD CONSTRAINT "order_transaction_collected_by_admin_id_fkey"
  FOREIGN KEY ("collected_by_admin_id") REFERENCES "admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_admin_id_fkey"
  FOREIGN KEY ("actor_admin_id") REFERENCES "admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "order_otps" ADD CONSTRAINT "order_otps_verified_by_admin_id_fkey"
  FOREIGN KEY ("verified_by_admin_id") REFERENCES "admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
COMMIT;
