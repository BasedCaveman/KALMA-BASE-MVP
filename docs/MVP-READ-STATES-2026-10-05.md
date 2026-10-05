# Focal read-state patch over119b206

Scope: client market lookup, faucet eligibility and known/unknown balance.
No contracts, wallet configuration, signing logic, jobs, history or schema.

## Evidence and cause boundary

Before patch, exact Preview119b206 /markets/3 showed Market not found after
reload. Profile/Today showed cooldown0m. Same active Chrome account address:
0x4CA2701E8E4a2325c155354EA310862bfa293cBB, not codextestcrash.
Direct read-only Base Sepolia RPC confirmed market3 and canClaim=true.
This reproduction is recorded in output/playwright/MVP-PREVIEW-READ-QA-119B206-
2026-10-05.md in the durable checkout. No new authenticated navigation or
effect-triggering retry was performed during patch preparation.

Confirmed presentation defects: failed batch fields were filtered out of
useMarkets; detail equated missing list item with notFound. useFaucet replaced
missing balance/canClaim with0n/false and fabricated cooldownSeconds0.
These code defects are distinct from the original browser transport cause.

The actual failing browser response/decode is NOT captured. CUA browser
surface has no network interception/response API; native Chrome observation
opened a different window without the Preview. No unrelated tab was changed.
No RPC/CORS/CSP cause is asserted. No transport replacement introduced.
Explicit chain84532 is defensive scoping, not a proven transport repair.

## Patch

- Detail requests only requested market ID, not all other markets. Existing
  list rendering and per-field transformations are reused.
- nextMarketId contract range establishes absent ID; timeout/decode failure
  is read error, never notFound. Essential detail reads have separate states.
- Faucet has idle/loading/error/success read states. Known false means test
  credits unavailable, not a timed cooldown: FaucetBS canClaim=!hasClaimed;
  no next-claim timestamp or countdown exists in that contract.
- Unknown/failed balance displays dash, not legitimate zero. Existing success
  strings and numeric formatting preserved. Read retries only refetch views.
- Additional consumer adjusted: app/create/page.tsx accepts undefined faucet
  balance, preserves browser-read fallback and displays dash if both absent.
  No create/approve/claim handlers changed.
- No validity-window code touched; existing predictionDeadline/endTime state
  derivation and historical signals remain unchanged.

## Literal EN/PT Copy proposal — focal review still required

| EN | PT |
|---|---|
| Loading data… | Carregando dados… |
| Could not load the data. Please try again. | Não foi possível carregar os dados. Tente novamente. |
| Try again | Tentar novamente |
| Test credits are unavailable for this account. | Créditos de teste indisponíveis para esta conta. |

Other languages fall back to proposed EN strings for only these new states.
Existing translated success/cash/market strings are not rewritten.

## Verification gates

Local state matrix and actual hook fixtures cover ID3 existing, ID4 proven
absent when nextMarketId4, loading, transport/decode failures, claim true/
false/unavailable, zero/nonzero/unavailable balance and chain84532 scoping.
Effects/authFetch/writes are disabled in fixtures. This is not live-browser QA.

Browser gate still open: capture endpoint, chain/pool, method/batch, actual
response/error and first failing read on same authenticated Chrome context.
Before any reload/login, install selective containment for drip, automatic
earnings collection and send/sign calls while preserving public read RPC.
Do not use a broad read-block or trigger drip to acquire diagnostics.

Publish/rebuild Preview only after presenting commit and concrete remote step
for authorization if unclear. Confirm new SHA/origin, market3, state faucet,
session/reload and temporal behavior there; no merge or Production release.
Do not add PRIVY_APP_SECRET/CRON_SECRET, replay migrations or invoke jobs.
Schema delta zero. Local suspension contingency and transaction QA remain
independent gates. Preview auth500 does not prove Production transactions work.
