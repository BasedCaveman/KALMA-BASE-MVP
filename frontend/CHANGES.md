# Kalma Polish Pass

8 files updated. Drop on top of kalma/frontend/, commit, push.

## What changed

### Profile page
- "Add funds" button added to Receive Funds panel — calls mega.deposit() to open MOSS funding UI (CEX -> MOSS, external wallet -> MOSS, etc).
- Copy address button upgraded — proper SVG copy icon + checkmark when copied. Much more obviously tappable.
- PT-BR strings: mercados -> cidades.

### Home page
- Intro text alignment: removed maxWidth:560 constraint on intro and startHint so text fills the card width naturally.
- Removed misleading "connect external wallet" hint — wrong since MOSS IS the wallet now.
- PT-BR: mercados -> cidades in 7 strings.

### Markets, Positions, Protection Simulator pages
- PT-BR mercados -> cidades sweep.

### useTranslation.tsx
- PT-BR keys: market.allMarkets -> "Todas as cidades", positions.explore -> "Explore cidades proximas".

### CreatorEarningsPanel
- PT-BR unit label: mercados -> cidades.

## What stays

- Spanish "mercados" — correct Spanish word. PT-BR rebrand is regional.
- English "markets" — same reasoning.

## Drop steps

  cd kalma/frontend
  unzip -o ~/Downloads/kalma_polish.zip
  git add -A
  git commit -m "polish: Add funds CTA + copy icon + PT-BR cidades sweep + home alignment"
  git push

## Open issues outside our control

These need Base Sepolia team intervention:

1. "Insufficient funds" with Sponsored chip showing — our /api/sponsor returns paymasterAndData:0x because we lack partner signer credentials. Ask Base Sepolia for them.
2. "Wallet relay timed out" — Base Sepolia infrastructure issue.
3. "Enter code" beta gate — Base Sepolia needs to whitelist kalma-sandy.vercel.app.
