import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { requireWalletAuth } from '@/lib/server/privy-auth';
import { DripConfigurationError, prepareEthDrip, type DripRow } from '@/lib/server/eth-drip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FAUCET = '0x45176C683A245e84c9ee3f56242532031490a005' as const;
const ABI = [{ type: 'function', name: 'dripEthFor', stateMutability: 'nonpayable', inputs: [{ name: 'user', type: 'address' }], outputs: [] }] as const;
const OWNER_ABI = [{ type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }] as const;

async function ensureLedger(sql: any) {
  await sql`CREATE TABLE IF NOT EXISTS eth_drip_claims (address TEXT PRIMARY KEY, status TEXT NOT NULL, tx_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { address?: string } | null;
  const address = body?.address;
  if (!address || !isAddress(address)) return NextResponse.json({ message: 'Invalid account.' }, { status: 400 });
  const auth = await requireWalletAuth(req, address);
  if (!auth.ok) return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });
  const databaseUrl = process.env.DATABASE_URL;
  const key = process.env.BASE_FAUCET_OWNER_PRIVATE_KEY;
  if (!databaseUrl || !key) return NextResponse.json({ error: 'drip_misconfigured', message: 'Test account preparation is not configured.' }, { status: 503 });
  try {
    const account = privateKeyToAccount(key as `0x${string}`);
    const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
    const sql = neon(databaseUrl);
    const normalized = address.toLowerCase();
    const transaction = { account, chain: baseSepolia, address: FAUCET, abi: ABI, functionName: 'dripEthFor', args: [address as `0x${string}`] } as const;
    const result = await prepareEthDrip({
      preflight: async () => {
        if (await publicClient.getChainId() !== baseSepolia.id) throw new DripConfigurationError('drip_wrong_chain', 'Test account preparation is not configured for this network.');
        const owner = await publicClient.readContract({ address: FAUCET, abi: OWNER_ABI, functionName: 'owner' });
        if (owner.toLowerCase() !== account.address.toLowerCase()) throw new DripConfigurationError('drip_owner_mismatch', 'Test account preparation is not configured for the faucet owner.');
        await publicClient.simulateContract(transaction);
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
      send: () => wallet.writeContract(transaction),
      wait: async hash => (await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 })).status,
      receipt: async hash => {
        try { return (await publicClient.getTransactionReceipt({ hash })).status; }
        catch (error) {
          if (error instanceof Error && error.name === 'TransactionReceiptNotFoundError') return null;
          throw error;
        }
      },
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof DripConfigurationError) return NextResponse.json({ error: error.code, message: error.message }, { status: 503 });
    // Do not log keys, JWTs, raw auth requests or complete RPC error objects.
    console.error('[eth-drip] preparation failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'drip_failed', message: 'Could not prepare your test account.' }, { status: 502 });
  }
}
