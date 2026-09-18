import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { requireWalletAuth } from '@/lib/server/privy-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FAUCET = '0x45176C683A245e84c9ee3f56242532031490a005' as const;
const ABI = [{ type: 'function', name: 'dripEthFor', stateMutability: 'nonpayable', inputs: [{ name: 'user', type: 'address' }], outputs: [] }] as const;

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
  const sql = neon(databaseUrl);
  await ensureLedger(sql);
  const normalized = address.toLowerCase();
  const claimed = await sql`INSERT INTO eth_drip_claims (address, status) VALUES (${normalized}, 'pending') ON CONFLICT (address) DO NOTHING RETURNING address`;
  if (claimed.length === 0) return NextResponse.json({ status: 'already_requested' });
  try {
    const account = privateKeyToAccount(key as `0x${string}`);
    const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
    const hash = await wallet.writeContract({ account: account.address, address: FAUCET, abi: ABI, functionName: 'dripEthFor', args: [address] });
    await publicClient.waitForTransactionReceipt({ hash });
    await sql`UPDATE eth_drip_claims SET status = 'sent', tx_hash = ${hash}, updated_at = NOW() WHERE address = ${normalized}`;
    return NextResponse.json({ status: 'sent', txHash: hash });
  } catch (error) {
    await sql`UPDATE eth_drip_claims SET status = 'failed', updated_at = NOW() WHERE address = ${normalized}`;
    console.error('[eth-drip] failed', error);
    return NextResponse.json({ error: 'drip_failed', message: 'Could not prepare your test account.' }, { status: 502 });
  }
}
