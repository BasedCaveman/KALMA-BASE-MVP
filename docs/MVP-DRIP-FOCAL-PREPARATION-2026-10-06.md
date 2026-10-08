# Focal drip preparation — MVP only

Candidate base: `ae58b0715024b82a76c7c0c0a9dfc252319ed1ee`, the production SHA served during QA. Branch: `codex/mvp-drip-local-signer-2026-10-06`. Preparation did not publish code or change production, secrets, ownership, or remote data. Pedro subsequently authorized committing and pushing this focal branch. That authorization does not include a merge, production release, signer configuration change, or ledger repair. Kalma.me remains untouched.

## Prepared changes

- Preserve the complete local account object in `wallet.writeContract`; never replace it with `account.address`.
- Confirm chain ID 84532, compare the signer with `owner()`, and simulate `dripEthFor` before reserving the ledger. Invalid configuration fails closed before reservation.
- Persist the hash immediately after submission, before waiting for a receipt. A timeout with a hash remains `pending`; a submission error without a hash becomes `submission_unknown`, never automatically retryable.
- Reconcile `pending` records with a hash by reading the receipt only. Confirm success or preserve a revert; never resubmit.
- Legacy `failed` records, `sent` records without a hash, unknown states, and ambiguous submissions require recovery rather than returning false success.
- Return HTTP 409 for `pending`, because the existing client treats any 2xx as permission to proceed to the cash claim. Do not change wallets, networks, contracts, copy, jobs, or frontend flows.
- Allow retry only for the **explicit operational marker** `retry_authorized` with `tx_hash IS NULL`. Atomic consumption through `ON CONFLICT ... WHERE` permits only one reservation. Never create that marker automatically.

## Configuration to review before release

| Item | Value / decision |
| --- | --- |
| Network | Base Sepolia, 84532 |
| Existing faucet | `0x45176C683A245e84c9ee3f56242532031490a005` |
| Owner read during QA | `0x3e10fd9874452dbba262ee5bb56475ff2621882c` |
| Current signer observed in the log | `0xa069F16D8B536c2B5d5a58ecbd99BEdF4c8Df4A6` — not the owner |
| `BASE_FAUCET_OWNER_PRIVATE_KEY` | Must correspond to the current owner. No value was read or replaced. Pedro or an authorized operator must configure it through a secure channel, never send a key in chat. Recheck the owner before release. |
| `DATABASE_URL` | Existing Neon drip ledger, not Supabase climate tables. Preserve the value. |
| Privy app/secret | Preserve configuration; authentication and token-to-wallet authorization remain required. |
| `CRON_SECRET`, climate role, schedules | No changes. The MVP remains without climate jobs or a climate writer. |

Do not transfer ownership to make QA pass. Funding the current signer is insufficient: `dripEthFor` is `onlyOwner`. This configuration remains a real gate; preparing code does not resolve it.

## Proposed QA-record recovery — not executed

Single target: `0x4ca2701e8e4a2325c155354ea310862bfa293cbb`. The October 6 attempt at 12:09:24.963 UTC returned a rejected RPC `eth_sendTransaction` and HTTP 502. The old handler implies a `failed` record; that row was not queried directly during this preparation.

1. Obtain separate authorization for ledger reconciliation/read access and any operational update. Confirm the database and inspect only the address, status, hash, and timestamps. Do not reapply migrations.
2. Preserve evidence of the row and rejected attempt in an operation record. Recheck the balance, known hashes/receipts, and `EthDripped` events for this recipient, including any pending transaction. Never infer absence of broadcast solely from zero balance, recipient nonce, or a null hash.
3. Only after proving this attempt did not send gas and obtaining explicit authorization for this record, prepare the conditional transition below. If a hash, ambiguous submission, or different state exists, stop and reconcile; do not clear the row.
4. Release and the correct signer must be approved before another drip. The marker is consumed by an atomic reservation; Privy authentication for this wallet is still required. Do not manually POST using a secret.

Proposed operational SQL, **not applied**. It must affect exactly one row, preserve the returned evidence in the operation record, and run inside a transaction that rolls back if a precondition fails:

```sql
UPDATE eth_drip_claims
SET status = 'retry_authorized', updated_at = NOW()
WHERE address = '0x4ca2701e8e4a2325c155354ea310862bfa293cbb'
  AND status = 'failed'
  AND tx_hash IS NULL
RETURNING address, status, tx_hash, created_at, updated_at;
```

No DELETE, truncation, generic reset, or changes to other addresses. Preserve `created_at` and evidence of the previous state. If the attempt is cancelled while the marker remains untouched, a separately authorized operation may revert `retry_authorized` to `failed`; never revert an already-consumed `pending` reservation.

The prepared delta requires no new columns or tables. The original `CREATE TABLE IF NOT EXISTS` DDL is preserved and was not executed remotely. No new migration is needed. Compatibility: the old handler returns `already_requested` for any existing row; do not blindly roll back to it or interpret its HTTP 200 as proof that ETH was received.

## Verification and limitations

`node scripts/test-eth-drip.mjs`: 27 cases passed with simulated RPC/ledger dependencies. Covers auth 401/403, invalid addresses, wrong owner/network, simulation failure, concurrent calls, retry markers, idempotency, timeouts, ledger failures, reverted receipts, and local signing. A real viem client with a fake transport proves `eth_sendRawTransaction`, without `eth_sendTransaction`; no request reached a real RPC and no configured key was used.

`node frontend/scripts/test-eth-drip-sql.mjs <PGlite-module>`: 10 cases passed in PostgreSQL WASM/PGlite 0.5.8, exclusively in memory. The script extracts the DDL and reservation SQL from the handler and operational SQL from this document, rather than testing different copies. Validates legacy-state rejection, rollback, the exact target, preservation of `created_at`/other rows, and single marker consumption. Twenty queued reservations use one connection; this is not proof of distributed concurrency across Neon workers. No dependency was added to the MVP package/lockfile. Tool reference: https://pglite.dev/docs/ .

Type checking (`tsc --noEmit --incremental false`): exit 0. Complete final-code build: exit 0, 32/32 pages, Next.js 15.5.25, dummy Supabase configuration pointing to 127.0.0.1:9. Existing viem/ox warnings and expected SSR fetch failures with that configuration are not proof of real reads. No `.env` or secret import. `git diff --check`: passed.

All 37 cases passed, but they do not prove on-chain success, a corrected production signer, or any remote ledger/configuration change. Commit/push approval does not authorize release, configuration changes, or operational recovery. The 100-USDC claim and automatic UI balance refresh remain pending a successful drip and the separately scoped authorized QA.
