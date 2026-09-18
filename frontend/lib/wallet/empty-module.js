//frontend/lib/wallet/empty-module.js
//
// Stub that `next.config.js` aliases `porto` and `porto/internal` to. We never
// use the Porto wallet connector, but @wagmi/connectors' porto.js (pulled in
// transitively via @privy-io/wagmi → wagmi → wagmi/connectors) does
// `import { RpcSchema } from 'porto'` and `import { z } from 'porto/internal'`
// at the top of the module. Those names are only referenced INSIDE the porto()
// connector factory, which is never called — but webpack's ESM static analysis
// still requires the named exports to exist, or it fails the build with
// "Attempted import error: 'z'/'RpcSchema' is not exported".
//
// So this stub provides those named exports as inert dummies. They satisfy the
// import graph and are never actually used at runtime.
export default {};
export const noop = () => {};
export const RpcSchema = {};
export const z = {};
