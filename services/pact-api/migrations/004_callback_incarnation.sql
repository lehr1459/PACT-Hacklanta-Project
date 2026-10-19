ALTER TABLE callback_uris ADD COLUMN revision bigint NOT NULL DEFAULT 0;
ALTER TABLE login_transactions ADD COLUMN callback_revision bigint NOT NULL DEFAULT 0;
