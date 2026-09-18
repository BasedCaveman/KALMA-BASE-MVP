//kalma/frontend/next.config.js
const path = require('path');
const webpack = require('webpack');

const csp = [
  "default-src 'self'",
  [
    "connect-src 'self'",
    // Base Sepolia RPCs (+ the kalma.me proxy, for cross-origin dev/preview testing
    // when NEXT_PUBLIC_MEGAETH_RPC_PROXY_URL points at the canonical proxy)
    "https://carrot.Base Sepolia.com",
    "https://timothy.Base Sepolia.com",
    "https://kalma.me",
    // WalletConnect support used transitively by Privy's wallet login flow.
    "https://rpc.walletconnect.com",
    "https://rpc.walletconnect.org",
    "https://rpc.reown.com",
    "wss://*.walletconnect.com",
    "wss://*.walletconnect.org",
    "wss://*.reown.com",
    "https://pulse.walletconnect.org",
    "https://explorer-api.walletconnect.com",
    // Privy (auth + embedded wallet infra)
    "https://auth.privy.io",
    "https://*.privy.io",
    "https://*.privy.systems",
    "wss://*.privy.io",
    // Coinbase Smart Wallet
    "https://*.coinbase.com",
    // Auth / identity
    "https://cognito.us-west-2.amazonaws.com",
    "https://kms.us-west-2.amazonaws.com",
    "https://cognito-identity.us-west-2.amazonaws.com",
    "https://*.google.com",
    "https://oauth.telegram.org",
    // Vercel
    "https://vercel.live",
    // Open-Meteo (weather data)
    "https://api.open-meteo.com",
    "https://archive-api.open-meteo.com",
    "https://geocoding-api.open-meteo.com",
    // ENS resolution (Ethereum mainnet — public RPCs with CCIP-Read support).
    // NOTE: eth.llamarpc.com does not return Access-Control-Allow-Origin
    // for kalma.me, so browser preflight fails and Chrome logs a CORS
    // error in the console. This is upstream behavior from wallet/identity
    // lookup code and we can't redirect it from the frontend. Functionally
    // harmless: identity gracefully degrades when ENS lookup fails. If the
    // console noise becomes a problem, proxy through /api/eth-rpc the
    // same way we do for Base Sepolia at /api/Base Sepolia-rpc.
    "https://eth.llamarpc.com",
    "https://ethereum.publicnode.com",
    // .mega domain resolution for optional user identity. Returns 404 for
    // users without a .mega domain; the lookup handles that gracefully.
    "https://api.dotmega.domains",
    // Currency exchange rates
    "https://api.exchangerate-api.com",
    // Supabase — used for places, signals, profiles. Wildcard so the
    // production project URL plus any preview branch project work.
    "https://*.supabase.co",
    "wss://*.supabase.co",
  ].join(' '),
  // Google Fonts
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // fonts.googleapis.com sometimes serves font binaries (not just CSS)
  // when its CDN routes a request directly; including it here silences
  // a CSP warning Chrome was logging on /profile.
  "font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://va.vercel-scripts.com",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  // Clickjacking: never allow kalma.me to be framed — the dapp signs
  // transactions silently (showWalletUIs:false), so a framed UI + overlay
  // could trick users into answering/claiming. (Audit M-1.)
  "frame-ancestors 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: csp,
          },
          // Hardening set (audit M-1). X-Frame-Options is the legacy twin of
          // frame-ancestors for older browsers.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), usb=()' },
        ],
      },
    ];
  },

  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');

    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@react-native-async-storage/async-storage': false,
      // NOTE: @base-org/account (Coinbase/Base smart-wallet SDK) is intentionally
      // NOT stubbed — Privy's createEthereumWalletConnector calls into it, and
      // stubbing it to false made that call "e is not a function".
      // Privy pulls in optional Farcaster mini-app connectors we don't use;
      // stub them so dev/build don't fail with "Can't resolve".
      '@farcaster/mini-app-solana': false,
      porto: path.resolve(__dirname, './lib/wallet/empty-module.js'),
      'porto/internal': path.resolve(__dirname, './lib/wallet/empty-module.js'),
    };

    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^porto$/,
        path.resolve(__dirname, './lib/wallet/empty-module.js')
      ),
      new webpack.NormalModuleReplacementPlugin(
        /^porto\/internal$/,
        path.resolve(__dirname, './lib/wallet/empty-module.js')
      )
    );

    return config;
  },
};

module.exports = nextConfig;
