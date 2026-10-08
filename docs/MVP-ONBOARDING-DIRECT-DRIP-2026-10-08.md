# Base MVP onboarding: direct starter gas and explicit USDC claim

## Cause and authorized correction

The deployed handler passed `account.address` instead of the server-local account object, selecting RPC signing (`eth_sendTransaction`), which the RPC rejected. Local signing alone would still fail: the funded sponsor is `0xa069F16D8B536c2B5d5a58ecbd99BEdF4c8Df4A6`, while faucet `0x45176C683A245e84c9ee3f56242532031490a005` belongs to `0x3e10FD9874452DBba262Ee5bB56475fF2621882C` and requires `onlyOwner` for `dripEthFor`.

On October 8, Pedro explicitly authorized direct native funding from the existing sponsor. The server sends exactly **0.001 ETH on Base Sepolia (84532)** to the authenticated linked wallet. It checks that the derived account equals the approved sponsor, then signs locally and uses raw submission. The existing `BASE_FAUCET_OWNER_PRIVATE_KEY` name is retained for compatibility. No secret replacement, ownership transfer, or contract redeployment is required. The signer pays value and gas. The execution cap is 200,000 gas at 5 gwei, at most 0.001 ETH execution-fee exposure; Base L1 data fees are additional.

The current faucet still releases **100 official Circle test USDC** only after an explicit deposit action. Native funding no longer calls the owner-gated faucet method.

Read-only RPC evidence on October 8: faucet balance 1 ETH, owner 5.999925512166232799 ETH, approved sponsor 2.996999595230008857 ETH. These are observations, not balance guarantees. Authenticated GET `/api/eth-drip?address=...` reports current chain, public derived signer and native balances without a send or SQL operation. Keys, JWTs, database URLs and raw RPC exceptions never enter responses or logs.

## Persistent controls

Privy token verification and linked-wallet ownership precede funding. Before reservation, check chain, approved sponsor, balance covering value plus the maximum execution fee, and gas estimation within the cap. The optional `BASE_DRIP_ALLOWED_WALLETS` list supports one or two exact valid addresses; malformed configured lists fail closed, and unset preserves the existing flow.

The existing Neon `eth_drip_claims` primary key permits one ordinary successful drip per normalized wallet. Store the hash before receipt waiting. Pending, ambiguous, reverted, legacy failed or malformed rows never silently re-send. A separately authorized, reconciled hash-free `retry_authorized` row may be atomically consumed once; this change sets no recovery marker.

All instances use a sentinel row in that same table, keyed by chain and signer. Conditional upsert provides exclusion, token fencing blocks stale updates/releases, and the pending nonce is obtained under the gate. Release after two confirmations or before any send attempt. Ambiguous broadcasts, lost hash persistence, crashes and receipt failures retain the gate. No TTL takeover exists. Other callers of this key must share the protocol or be stopped during QA.

Schema delta: **zero**. Existing SELECT/INSERT/UPDATE grants and the route's existing CREATE TABLE IF NOT EXISTS behavior remain. No remote migration. Supabase climate data, reader role and eight blocked jobs stay unchanged.

## Client behavior

Already funded wallets (at least 0.000005 ETH) bypass the sponsor API. Multiple hook instances share one in-flight preparation per address. Automatic preparation waits for Privy readiness and authentication. Only explicit pending/busy/auth-readiness responses retry, bounded at eight attempts. Known hashes are confirmed without another POST; ambiguous and recovery-required results stop.

Expose preparation busy state and errors. Confirm receipt and refresh native balance before requesting USDC. Contain repeated clicks within each hook and refresh token balance and eligibility queries after confirmation. An unavailable balance stays an error, never zero. No automatic USDC claim.

## Verification

- 38 backend route/policy cases: auth, sponsor/chain/balance/gas guards, ledger recovery, nonce wiring, pilot config, safe GET audit, raw local signing and failures.
- 11 client policy cases: funded bypass, component deduplication, pending hash, bounded retries, ambiguity containment, unavailable balances and explicit retry.
- 10 PGlite cases: actual reservation/recovery SQL, marker consumption, unrelated-row preservation and rollback. Single-connection tests are not distributed evidence.
- 14 disposable native PostgreSQL cases, 21 independent connections: cross-recipient contention, transaction blocking, token fencing, ambiguity/failures, settlement/revert recovery, stale locks and sequential nonce use. Fake chain only.
- Final TypeScript/build, published SHA/checks and production browser receipts must be recorded separately. A local build completed 32/32 pages with dummy public Supabase values; this proves compilation, not live database or sponsor configuration.

## Controlled real test and return

Start with one fresh team-controlled Privy wallet. Record served SHA and authenticated GET readiness; verify the sponsor equals the approved address. Allow one 0.001 ETH funding transfer, verify two confirmations and native balance increase, then explicitly claim 100 USDC once. Record both hashes, recipient, receipts, before/after balances, gas and UI refresh without reload. If a second team wallet is necessary, cap funding at two recipients and 0.002 ETH total. No ambiguous-row reset, manual POST replay, hash clearing or ownership change.

Per-user/IP limits, aggregate daily budgets and sybil controls remain external-launch work. Per-wallet uniqueness is not a per-user limit; this release targets internal testnet use.

If service must stop, use an approved fail-closed disable, preserving every ledger row and hash. Reconcile pending submissions before returning service. Do not return to the old false-success handler or discard signer exclusion. Preserve climate reader role and disabled schedules on any deployment return.
