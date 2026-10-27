ALTER TABLE developer_applications ADD COLUMN policy_epoch bigint NOT NULL DEFAULT 0;
CREATE TABLE app_resources (
 app_id text NOT NULL REFERENCES developer_applications(id), resource_key text NOT NULL,
 offer_address text NOT NULL, version integer NOT NULL, enabled boolean NOT NULL,
 created_at bigint NOT NULL, updated_at bigint NOT NULL, verified_at bigint NOT NULL,
 context_slot bigint NOT NULL, PRIMARY KEY(app_id,resource_key),
 CHECK (version > 0), CHECK (context_slot >= 0)
);
CREATE TABLE resource_versions (
 app_id text NOT NULL, resource_key text NOT NULL, version integer NOT NULL,
 offer_address text NOT NULL, enabled boolean NOT NULL, verified_at bigint NOT NULL,
 context_slot bigint NOT NULL, actor_id text NOT NULL REFERENCES developer_accounts(id),
 actor_wallet text NOT NULL, action_challenge_id text NOT NULL,
 signature_hash text NOT NULL, created_at bigint NOT NULL,
 PRIMARY KEY(app_id,resource_key,version),
 FOREIGN KEY(app_id,resource_key) REFERENCES app_resources(app_id,resource_key)
);
CREATE INDEX resources_offer ON app_resources(offer_address);
