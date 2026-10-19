ALTER TABLE usage_aggregates ADD COLUMN latency_total_ms bigint NOT NULL DEFAULT 0;
ALTER TABLE usage_aggregates ADD COLUMN latency_max_ms bigint NOT NULL DEFAULT 0;
CREATE TABLE usage_reasons (
 app_id text NOT NULL REFERENCES developer_applications(id), bucket bigint NOT NULL,
 reason text NOT NULL, requests bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(app_id,bucket,reason)
);
