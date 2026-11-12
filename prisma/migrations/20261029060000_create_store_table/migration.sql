-- The store table predates the original migration history. Supply its missing
-- prerequisite before add_store_time. Existing installations keep their table/data.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tbl_store (
    storeid BIGSERIAL PRIMARY KEY,
    storename VARCHAR(50),
    store_code VARCHAR(50) DEFAULT '',
    company_code VARCHAR(50),
    storeaddress1 VARCHAR(200),
    storeaddress2 VARCHAR(200),
    storecity VARCHAR(30),
    storestate VARCHAR(20),
    storezipcode VARCHAR(10),
    storephonenumber VARCHAR(15),
    storefaxnumber VARCHAR(15),
    storeaccountnumber VARCHAR(30),
    storeroutingnumber VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by INTEGER NOT NULL,
    created_on TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    updated_on TIMESTAMP(6),
    is_delete BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS tbl_store_store_code_idx ON public.tbl_store (store_code);

COMMIT;
