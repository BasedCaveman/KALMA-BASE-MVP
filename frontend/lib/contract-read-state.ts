export type ReadStatus = 'idle' | 'loading' | 'error' | 'success';
export type ReadSnapshot<T = unknown> = { data?: T; isError?: boolean };

// Never convert an unavailable read into a valid zero/false response.
export function readStatus<T>(read: ReadSnapshot<T>, enabled = true): ReadStatus {
  if (!enabled) return 'idle';
  if (read.isError) return 'error';
  return read.data === undefined ? 'loading' : 'success';
}

export type MarketReadStatus = 'loading' | 'error' | 'not_found' | 'success';
export function marketReadStatus(
  id: bigint,
  count: ReadSnapshot<bigint>,
  fields: Array<{ data?: readonly { status: string }[]; isError?: boolean }>,
): MarketReadStatus {
  // validMarket in ClimatePoolBS: IDs start at1 and must be < nextMarketId.
  if (id <= 0n) return 'not_found';
  const countStatus = readStatus(count);
  if (countStatus === 'error') return 'error';
  if (countStatus !== 'success') return 'loading';
  if (id >= count.data!) return 'not_found';
  if (fields.some((field) => field.isError || field.data?.some((item) => item.status !== 'success'))) return 'error';
  if (fields.some((field) => !field.data?.length)) return 'loading';
  return 'success';
}

export function faucetReadState(connected: boolean, balanceRead: ReadSnapshot<bigint>, claimRead: ReadSnapshot<boolean>) {
  const balanceStatus = readStatus(balanceRead, connected);
  const claimStatus = readStatus(claimRead, connected);
  const balance = balanceStatus === 'success' ? balanceRead.data : undefined;
  const canClaim = claimStatus === 'success' ? claimRead.data : undefined;
  return {
    balanceStatus, claimStatus, balance, canClaim,
    showBanner: connected && balance === 0n && canClaim === true,
    claimUnavailable: connected && balance === 0n && canClaim === false,
  };
}
