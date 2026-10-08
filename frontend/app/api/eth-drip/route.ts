import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { requireWalletAuth } from '@/lib/server/privy-auth';
import { DripConfigurationError, prepareEthDrip, type DripRow } from '@/lib/server/eth-drip';
import { randomUUID } from 'node:crypto';
import { createSignerGate, SignerBusyError } from '@/lib/server/drip-signer-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DRIP_AMOUNT = 1_000_000_000_000_000n;
const MAX_GAS = 200_000n;
const MAX_FEE = 5_000_000_000n;
const EXPECTED_SIGNER = '0xa069f16d8b536c2b5d5a58ecbd99bedf4c8df4a6';

// Authenticated configuration audit: public addresses only, no send or SQL.
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');
  if (!address || !isAddress(address)) return NextResponse.json({ error: 'invalid_account' }, { status: 400 });
  const auth = await requireWalletAuth(req, address);
  if (!auth.ok) return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });
  const key = process.env.BASE_FAUCET_OWNER_PRIVATE_KEY;
  if (!key || !process.env.DATABASE_URL) return NextResponse.json({ error: 'drip_misconfigured' }, { status: 503 });
  try {
    const account = privateKeyToAccount(key as `0x${string}`);
    const client = createPublicClient({ chain: baseSepolia, transport: http() });
    const chainId = await client.getChainId();
    const [signerBalance, recipientBalance] = await Promise.all([
      client.getBalance({ address: account.address }), client.getBalance({ address: address as `0x${string}` }),
    ]);
    return NextResponse.json({ chainId, fundingMode: 'direct_transfer', signerAddress: account.address,
      signerBalanceWei: signerBalance.toString(), recipientBalanceWei: recipientBalance.toString(),
      amountWei: DRIP_AMOUNT.toString(), configured: account.address.toLowerCase() === EXPECTED_SIGNER && chainId === baseSepolia.id && signerBalance >= DRIP_AMOUNT + MAX_GAS * MAX_FEE },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'drip_audit_unavailable' }, { status: 502 }); }
}

async function ensureLedger(sql: any) {
  await sql`CREATE TABLE IF NOT EXISTS eth_drip_claims (address TEXT PRIMARY KEY, status TEXT NOT NULL, tx_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { address?: string } | null;
  const address = body?.address;
  if (!address || !isAddress(address)) return NextResponse.json({ message: 'Invalid account.' }, { status: 400 });
  const auth = await requireWalletAuth(req, address);
  if (!auth.ok) return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });
  // Optional internal pilot allowlist. Unset preserves the existing flow;
  // when configured, reject malformed lists rather than silently widening them.
  const allowlistValue = process.env.BASE_DRIP_ALLOWED_WALLETS?.trim() ?? '';
  const allowed = allowlistValue ? allowlistValue.split(',').map(x => x.trim().toLowerCase()) : [];
  if (allowed.length > 2 || allowed.some(x => !isAddress(x)) || new Set(allowed).size !== allowed.length) return NextResponse.json({ error: 'drip_pilot_unconfigured', message: 'Test account preparation is not configured.' }, { status: 503 });
  if (allowed.length && !allowed.includes(address.toLowerCase())) return NextResponse.json({ error: 'drip_pilot_restricted', message: 'Test account preparation is currently limited to the internal team.' }, { status: 403 });
  const databaseUrl = process.env.DATABASE_URL;
  const key = process.env.BASE_FAUCET_OWNER_PRIVATE_KEY;
  if (!databaseUrl || !key) return NextResponse.json({ error: 'drip_misconfigured', message: 'Test account preparation is not configured.' }, { status: 503 });
  let gate: Awaited<ReturnType<typeof createSignerGate>> | undefined;
  try {
    const account = privateKeyToAccount(key as `0x${string}`);
    const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
    const sql = neon(databaseUrl);
    const normalized = address.toLowerCase();
    const signer = account.address.toLowerCase();
    const chainId = baseSepolia.id;
    const lockAddress = `__signer_lock__:${chainId}:${signer}`;
    // The explicitly authorized, existing funded signer sponsors native gas.
    // USDC claiming stays on the existing faucet contract.
    const transaction = { account, chain: baseSepolia, to: address as `0x${string}`, value: DRIP_AMOUNT, gas: MAX_GAS, maxFeePerGas: MAX_FEE, maxPriorityFeePerGas: 1_000_000n } as const;
    const receipt = async (hash: `0x${string}`) => {
      try {
        const found = await publicClient.getTransactionReceipt({ hash });
        // Two confirmations before another nonce may be used by this pilot.
        if (await publicClient.getBlockNumber() < found.blockNumber + 1n) return null;
        return found.status;
      } catch (error) {
        if (error instanceof Error && error.name === 'TransactionReceiptNotFoundError') return null;
        throw error;
      }
    };
    const result = await prepareEthDrip({
      preflight: async () => {
        if (await publicClient.getChainId() !== baseSepolia.id) throw new DripConfigurationError('drip_wrong_chain', 'Test account preparation is not configured for this network.');
        if (account.address.toLowerCase() !== EXPECTED_SIGNER)
          throw new DripConfigurationError('drip_signer_mismatch', 'Test account preparation is not configured for the approved sponsor.');
        if (await publicClient.getBalance({ address: account.address }) < DRIP_AMOUNT + MAX_GAS * MAX_FEE)
          throw new DripConfigurationError('drip_signer_unfunded', 'Test account preparation is temporarily unavailable.');
        if (await publicClient.estimateGas(transaction) > MAX_GAS)
          throw new DripConfigurationError('drip_gas_limit', 'This account could not be prepared automatically.');
        // Use the existing Neon ledger table: no new table or migration.
        await ensureLedger(sql);
        gate = await createSignerGate({
          read: async () => {
            const rows = await sql`SELECT status, tx_hash FROM eth_drip_claims WHERE address = ${lockAddress} AND status LIKE 'signer_lock:%'`;
            const row = rows[0] as { status: string; tx_hash: string | null } | undefined;
            return row ? { token: row.status.slice('signer_lock:'.length), tx_hash: row.tx_hash } : null;
          },
          acquire: async token => {
            const value = `signer_lock:${token}`;
            const rows = await sql`INSERT INTO eth_drip_claims (address, status, tx_hash) VALUES (${lockAddress}, ${value}, NULL)
              ON CONFLICT (address) DO UPDATE SET status = EXCLUDED.status, tx_hash = NULL, updated_at = NOW()
              WHERE eth_drip_claims.status = 'signer_released' RETURNING status`;
            return rows.length === 1;
          },
          hash: async (token, hash) => {
            const value = `signer_lock:${token}`;
            const rows = await sql`UPDATE eth_drip_claims SET tx_hash = ${hash}, updated_at = NOW() WHERE address = ${lockAddress} AND status = ${value} RETURNING status`;
            if (rows.length !== 1) throw new Error('Signer lock lost.');
          },
          release: async token => { const value = `signer_lock:${token}`; await sql`UPDATE eth_drip_claims SET status = 'signer_released', updated_at = NOW() WHERE address = ${lockAddress} AND status = ${value}`; },
        }, randomUUID(), receipt);
      },
      reserve: async () => {
        await ensureLedger(sql);
        // Only a separately reconciled/operator-authorized row can be reused.
        // The ON CONFLICT predicate atomically consumes that explicit marker.
        const rows = await sql`INSERT INTO eth_drip_claims (address, status) VALUES (${normalized}, 'pending')
          ON CONFLICT (address) DO UPDATE SET status = 'pending', updated_at = NOW()
          WHERE eth_drip_claims.status = 'retry_authorized' AND eth_drip_claims.tx_hash IS NULL
          RETURNING status, tx_hash`;
        return (rows[0] as DripRow | undefined) ?? null;
      },
      existing: async () => {
        const rows = await sql`SELECT status, tx_hash FROM eth_drip_claims WHERE address = ${normalized}`;
        return (rows[0] as DripRow | undefined) ?? null;
      },
      save: async (status, hash) => { await sql`UPDATE eth_drip_claims SET status = ${status}, tx_hash = ${hash}, updated_at = NOW() WHERE address = ${normalized}`; },
      // Keep the LOCAL account object, never replace it with account.address.
      send: () => gate!.send(async () => {
        const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' });
        return wallet.sendTransaction({ ...transaction, nonce });
      }),
      wait: async hash => {
        const found = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000, confirmations: 2 });
        gate!.settled();
        return found.status;
      },
      receipt,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof SignerBusyError) return NextResponse.json({ error: 'drip_signer_busy', message: 'Another test account is being prepared. Please check again shortly.' }, { status: 409 });
    if (error instanceof DripConfigurationError) return NextResponse.json({ error: error.code, message: error.message }, { status: 503 });
    // Do not log keys, JWTs, raw auth requests or complete RPC error objects.
    console.error('[eth-drip] preparation failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'drip_failed', message: 'Could not prepare your test account.' }, { status: 502 });
  } finally {
    // Failed release keeps exclusion in place; never force-unlock or retry send.
    try { await gate?.close(); } catch { console.error('[eth-drip] signer release failed'); }
  }
}
