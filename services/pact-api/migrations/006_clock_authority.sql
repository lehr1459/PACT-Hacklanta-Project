CREATE TABLE clock_bindings (
 namespace_hash text PRIMARY KEY CHECK(length(namespace_hash)=64),
 clock_uuid text NOT NULL CHECK(length(clock_uuid)=36),
 created_at bigint NOT NULL
);
ALTER TABLE api_credentials ADD COLUMN authority_uuid text;
UPDATE callback_uris SET status=CASE WHEN status='revoked' THEN 'revoked' ELSE 'pending' END,
 proof_hash=NULL,proof_expires_at=NULL,verified_until=NULL,revision=revision+1 WHERE local=false;
CREATE INDEX usage_reasons_retention ON usage_reasons(bucket);
CREATE INDEX usage_aggregates_retention ON usage_aggregates(bucket);
CREATE INDEX audit_retention ON security_audit_events(created_at);
CREATE INDEX budgets_retention ON request_budgets(window_start);
CREATE INDEX credentials_revocation_retention ON api_credentials(revoked_at);
CREATE INDEX challenges_wallet ON admin_challenges(wallet);
CREATE INDEX credential_rotation_lineage ON api_credentials(rotated_from);
CREATE INDEX login_creator_credential ON login_transactions(creator_credential_id);
