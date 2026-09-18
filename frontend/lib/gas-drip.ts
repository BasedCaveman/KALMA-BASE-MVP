import { isAddress, type Address } from 'viem';

export const GAS_DRIP_CHAIN_ID = 6343;
export const GAS_DRIP_MESSAGE_VERSION = '1';
export const GAS_DRIP_DEFAULT_AMOUNT_ETH = '0.00002';
export const GAS_DRIP_MIN_BALANCE_WEI = 5_000_000_000_000n; // 0.000005 ETH

export type GasDripWalletKind = string;

export function normalizeDripAddress(address: string): Address {
  if (!isAddress(address)) {
    throw new Error('Invalid account address.');
  }

  return address.toLowerCase() as Address;
}

export function buildGasDripMessage(params: {
  address: string;
  timestamp: number;
}) {
  const address = normalizeDripAddress(params.address);

  return [
    'Kalma ETH drip request',
    `Version: ${GAS_DRIP_MESSAGE_VERSION}`,
    `Chain: ${GAS_DRIP_CHAIN_ID}`,
    `Address: ${address}`,
    `Timestamp: ${params.timestamp}`,
    '',
    'I am requesting a one-time starter ETH drip for this Kalma testnet wallet.',
  ].join('\n');
}

export function parseGasDripMessage(message: string) {
  const lines = message.split('\n');
  const title = lines[0]?.trim();

  if (title !== 'Kalma ETH drip request') {
    throw new Error('Invalid ETH drip message.');
  }

  const values = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }

  const version = values.get('Version');
  const chain = Number(values.get('Chain'));
  const address = normalizeDripAddress(values.get('Address') ?? '');
  const timestamp = Number(values.get('Timestamp'));

  if (version !== GAS_DRIP_MESSAGE_VERSION) {
    throw new Error('Unsupported ETH drip message version.');
  }

  if (chain !== GAS_DRIP_CHAIN_ID) {
    throw new Error('Gas drip request is for the wrong chain.');
  }

  if (!Number.isFinite(timestamp)) {
    throw new Error('Invalid ETH drip timestamp.');
  }

  return { address, chain, timestamp, version };
}
