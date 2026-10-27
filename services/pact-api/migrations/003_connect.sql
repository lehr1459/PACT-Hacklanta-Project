CREATE TABLE login_transactions (
 id text PRIMARY KEY, app_id text NOT NULL REFERENCES developer_applications(id),
 creator_credential_id text NOT NULL REFERENCES api_credentials(id),
 callback_id text NOT NULL REFERENCES callback_uris(id), redirect_uri text NOT NULL,
 environment text NOT NULL DEFAULT 'devnet' CHECK(environment='devnet'),
 policy_epoch bigint NOT NULL, purpose text NOT NULL, state text NOT NULL,
 state_hash text NOT NULL, code_challenge text NOT NULL,
 created_at bigint NOT NULL, expires_at bigint NOT NULL, browser_binding_hash text,
 wallet text, active_challenge_id text, code_hash text UNIQUE, code_expires_at bigint, redeemed_at bigint
);
CREATE INDEX login_transactions_expiry ON login_transactions(expires_at);
CREATE INDEX login_transactions_app ON login_transactions(app_id);
CREATE TABLE wallet_challenges (
 id text PRIMARY KEY, transaction_id text NOT NULL REFERENCES login_transactions(id),
 wallet text NOT NULL, binding_hash text NOT NULL, message text NOT NULL,
 created_at bigint NOT NULL, expires_at bigint NOT NULL, consumed_at bigint
);
CREATE INDEX wallet_challenges_expiry ON wallet_challenges(expires_at);
CREATE INDEX wallet_challenges_transaction ON wallet_challenges(transaction_id);
CREATE TABLE wallet_grants (
 id text PRIMARY KEY, token_hash text NOT NULL UNIQUE,
 app_id text NOT NULL REFERENCES developer_applications(id),
 environment text NOT NULL DEFAULT 'devnet' CHECK(environment='devnet'),
 wallet text NOT NULL, policy_epoch bigint NOT NULL,
 provenance_login_id text NOT NULL, created_at bigint NOT NULL,
 expires_at bigint NOT NULL, revoked_at bigint
);
CREATE INDEX wallet_grants_expiry ON wallet_grants(expires_at);
CREATE INDEX wallet_grants_app ON wallet_grants(app_id);
