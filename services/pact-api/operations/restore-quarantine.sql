-- OFFLINE, ISOLATED RESTORE ONLY. Stop/drain all API and auth ingress first.
-- Verify trusted host time, database identity and an independent backup first.
-- Owner approval is required for any external database. This is NOT a migration.
-- After this transaction: use a NEW secret-manager pepper and NEW private empty
-- clock directory (new namespace/UUID), reauthenticate, reissue keys and reapprove
-- apps/callbacks before opening ingress. Never copy the old authority into it.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
SET LOCAL synchronous_commit = on;
UPDATE developer_applications SET status='paused', policy_epoch=policy_epoch+1,
 updated_at=floor(extract(epoch FROM transaction_timestamp())*1000)::bigint;
UPDATE api_credentials SET revoked_at=COALESCE(revoked_at,floor(extract(epoch FROM transaction_timestamp())*1000)::bigint);
UPDATE admin_sessions SET revoked_at=COALESCE(revoked_at,floor(extract(epoch FROM transaction_timestamp())*1000)::bigint);
UPDATE wallet_grants SET revoked_at=COALESCE(revoked_at,floor(extract(epoch FROM transaction_timestamp())*1000)::bigint);
UPDATE admin_challenges SET consumed_at=COALESCE(consumed_at,floor(extract(epoch FROM transaction_timestamp())*1000)::bigint);
UPDATE action_challenges SET consumed_at=COALESCE(consumed_at,floor(extract(epoch FROM transaction_timestamp())*1000)::bigint);
UPDATE wallet_challenges SET consumed_at=COALESCE(consumed_at,floor(extract(epoch FROM transaction_timestamp())*1000)::bigint);
UPDATE login_transactions SET redeemed_at=COALESCE(redeemed_at,floor(extract(epoch FROM transaction_timestamp())*1000)::bigint),
 expires_at=0,code_expires_at=0;
UPDATE callback_uris SET status=CASE WHEN status='revoked' THEN 'revoked' ELSE 'pending' END,
 proof_hash=NULL,proof_expires_at=NULL,verified_until=NULL,revision=revision+1 WHERE local=false;
-- Keep resource_versions, audit evidence and old clock_bindings intact.
COMMIT;
