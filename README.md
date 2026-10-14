# StableFlow — Frontend

A lightweight **cross-chain bridge UI** powered by [NEAR Intents](https://docs.near-intents.org/).  
Users simply specify what they want to achieve — e.g., *bridge USDT from BSC to NEAR* — and solvers compete to execute the most efficient route.

---

## Overview

This project is a **Next.js + TypeScript** frontend that connects directly to the **NEAR Intents APIs**, including:
- [1Click API](https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api)
- [Solver Relay](https://docs.near-intents.org/near-intents/market-makers/bus/solver-relay)
- [Explorer API](https://docs.near-intents.org/near-intents/integration/distribution-channels/intents-explorer-api)

It is designed to be chain-agnostic and easily extensible.

---

## API Integration

### 1. Quote Request
`POST {INTENTS_SOLVER_RELAY}/quote`
```json
{
  "defuse_asset_identifier_in": "polygon:USDT",
  "defuse_asset_identifier_out": "near:USDC",
  "exact_amount_in": "1000000",
  "account_id": "receiver.near"
}
```

### 2. Create Intent
`POST {INTENTS_1CLICK_BASE}/intents`
```json
{
  "account_id": "receiver.near",
  "route": {
    "solver": "example-solver",
    "path": ["polygon:USDT", "eth:USDC", "near:USDC"]
  },
  "amount_in": "1000000"
}
```

### 3. Deposit Address
`POST {INTENTS_1CLICK_BASE}/deposit_address`
```json
{
  "account_id": "receiver.near",
  "asset": "bsc:USDT"
}
```

### 4. Track Status
`GET {INTENTS_EXPLORER_BASE}/swaps?account_id=receiver.near`

---

## Supported RPC Endpoints

| Chain | RPC URL |
|--------|----------|
| Ethereum | https://eth.merkle.io |
| Polygon | https://polygon-rpc.com |
| Arbitrum | https://arb1.arbitrum.io/rpc |
| BNB Chain | https://56.rpc.thirdweb.com |
| Base | https://mainnet.base.org |
| Avalanche | https://api.avax.network/ext/bc/C/rpc |
| Optimism | https://mainnet.optimism.io |
| Gnosis | https://rpc.gnosischain.com |

---

## Fund Collection Addresses

| Chain | Explorer Link |
|--------|----------------|
| Polygon | [0x233c5370ccfb3cd7409d9a3fb98ab94de94cb4cd](https://polygonscan.com/address/0x233c5370ccfb3cd7409d9a3fb98ab94de94cb4cd) |
| Arbitrum | [0x2cff890f0378a11913b6129b2e97417a2c302680](https://arbiscan.io/address/0x2cff890f0378a11913b6129b2e97417a2c302680) |
| BNB Chain | [0x233c5370ccfb3cd7409d9a3fb98ab94de94cb4cd](https://bscscan.com/address/0x233c5370ccfb3cd7409d9a3fb98ab94de94cb4cd) |

---

## Frontend Structure

- **Framework:** Next.js 14 + React 18 + TypeScript  
- **Styling:** Tailwind CSS + shadcn/ui  
- **State Management:** React Query / SWR  
- **Deployment:** Works seamlessly on Vercel, Netlify, or Cloudflare

### Key Components
| Component | Function |
|------------|-----------|
| `/components/BridgeForm` | Handles user input and quote fetching |
| `/components/QuoteList` | Displays solver quotes with time estimates |
| `/components/History` | Tracks recent intents and statuses |
| `/lib/api.ts` | Contains wrappers for NEAR Intents API requests |
| `/config/` | Chain and token metadata |

---

## Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_INTENTS_1CLICK_BASE=https://api.near-intents.org/1click
NEXT_PUBLIC_INTENTS_SOLVER_RELAY=https://api.near-intents.org/solver
NEXT_PUBLIC_INTENTS_EXPLORER_BASE=https://api.near-intents.org/explorer

NEXT_PUBLIC_DEFAULT_FROM_CHAIN="polygon"
NEXT_PUBLIC_DEFAULT_TO_CHAIN="near"
NEXT_PUBLIC_STATUS_POLL_MS=4000
```

---

## Example Workflow

1. **User Input:** select source chain, token, and target chain.  
2. **Quote Fetching:** frontend queries the solver relay for best route.  
3. **Intent Creation:** user confirms and creates a 1Click intent.  
4. **Deposit & Status:** show deposit address → monitor transaction until completion.

---

## Useful References

- NEAR Intents Docs → [docs.near-intents.org](https://docs.near-intents.org/)  
- 1Click API Overview → [link](https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api)  
- Explorer API → [link](https://docs.near-intents.org/near-intents/integration/distribution-channels/intents-explorer-api)  
- Example implementation (community) → [GitHub Search: near-intents bridge](https://github.com/search?q=near-intents+bridge)
