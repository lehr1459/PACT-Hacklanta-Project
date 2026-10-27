CREATE TABLE developer_accounts (
 id text PRIMARY KEY, wallet text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
 created_at bigint NOT NULL
);
CREATE TABLE developer_applications (
 id text PRIMARY KEY, owner_id text NOT NULL REFERENCES developer_accounts(id),
 name text NOT NULL, description text NOT NULL DEFAULT '', framework text NOT NULL,
 environment text NOT NULL DEFAULT 'devnet' CHECK(environment = 'devnet'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused')),
 created_at bigint NOT NULL, updated_at bigint NOT NULL,
 UNIQUE(id,owner_id)
);
CREATE INDEX apps_owner ON developer_applications(owner_id);
CREATE TABLE admin_sessions (
 token_hash text PRIMARY KEY, account_id text NOT NULL REFERENCES developer_accounts(id),
 binding_hash text NOT NULL, created_at bigint NOT NULL, expires_at bigint NOT NULL,
 revoked_at bigint
);
CREATE INDEX sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE admin_challenges (
 id text PRIMARY KEY, wallet text NOT NULL, binding_hash text NOT NULL,
 message text NOT NULL, created_at bigint NOT NULL, expires_at bigint NOT NULL,
 consumed_at bigint
);
CREATE INDEX challenges_expiry ON admin_challenges(expires_at);
CREATE TABLE action_challenges (
 id text PRIMARY KEY, account_id text NOT NULL REFERENCES developer_accounts(id),
 session_hash text NOT NULL REFERENCES admin_sessions(token_hash),
 app_id text NOT NULL REFERENCES developer_applications(id), action text NOT NULL,
 payload_hash text NOT NULL, message text NOT NULL,
 created_at bigint NOT NULL, expires_at bigint NOT NULL, consumed_at bigint
);
CREATE INDEX action_expiry ON action_challenges(expires_at);
CREATE TABLE callback_uris (
 id text PRIMARY KEY, app_id text NOT NULL REFERENCES developer_applications(id),
 uri text NOT NULL, website_origin text NOT NULL, hostname text NOT NULL,
 local boolean NOT NULL, status text NOT NULL CHECK(status IN ('pending','verified','revoked')),
 proof_hash text, proof_expires_at bigint, verified_until bigint,
 created_at bigint NOT NULL, UNIQUE(app_id,uri)
);
CREATE INDEX callbacks_app ON callback_uris(app_id);
CREATE TABLE api_credentials (
 id text PRIMARY KEY, app_id text NOT NULL REFERENCES developer_applications(id),
 creator_id text NOT NULL REFERENCES developer_accounts(id),
 name text NOT NULL, prefix text NOT NULL, token_hash text NOT NULL UNIQUE,
 scopes text NOT NULL, created_at bigint NOT NULL, expires_at bigint NOT NULL,
 last_used_at bigint, revoked_at bigint, rotated_from text REFERENCES api_credentials(id)
);
CREATE INDEX credentials_app ON api_credentials(app_id);
CREATE INDEX credentials_expiry ON api_credentials(expires_at);
CREATE TABLE security_audit_events (
 id text PRIMARY KEY, owner_id text NOT NULL REFERENCES developer_accounts(id),
 app_id text REFERENCES developer_applications(id), type text NOT NULL,
 request_id text NOT NULL, outcome text NOT NULL, created_at bigint NOT NULL
);
CREATE INDEX events_owner_app_time ON security_audit_events(owner_id,app_id,created_at);
CREATE TABLE usage_aggregates (
 app_id text NOT NULL REFERENCES developer_applications(id), bucket bigint NOT NULL,
 requests bigint NOT NULL DEFAULT 0, allowed bigint NOT NULL DEFAULT 0,
 denied bigint NOT NULL DEFAULT 0, errors bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(app_id,bucket)
);
CREATE TABLE request_budgets (
 budget_key text PRIMARY KEY, window_start bigint NOT NULL, hits integer NOT NULL
);
