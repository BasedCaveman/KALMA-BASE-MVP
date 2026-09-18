# Full MOSS Migration — Drop-in Bundle

## What this is

26 files patched + 2 new shim hooks. Everything preserves the path structure
relative to kalma/frontend/. Drop on top of your repo, commit, push.

## Reads vs writes

- Reads (useReadContract, useBalance, useWaitForTransactionReceipt) still use
  wagmi via viem publicClient. Don't need a connector. Work for free.
- Writes (writeContract({...})) route through mega.callContract(...).
- Account state (address, isConnected) read from mega.status() and
  mega.events.onStatusChange.

## Drop steps

cd kalma/frontend
unzip -o kalma_moss_full.zip
git add -A
git commit -m "feat: full MOSS migration"
git push

## Test flow

1. Home -> "Começar" -> MOSS UI opens
2. Password "moss" -> create wallet
3. Profile shows address with copy button
4. Faucet works (USDC + ETH)
5. Create city / Predict / Claim all via MOSS

## Known

- "Enter code" gate ("moss") is MOSS-side beta. Ask Base Sepolia team to whitelist
  kalma-sandy.vercel.app domain to remove it.
- Web3Provider still creates AppKit instance for wagmi reads. Harmless. Can
  remove in follow-up cleanup.
