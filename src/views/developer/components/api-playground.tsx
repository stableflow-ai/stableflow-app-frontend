"use client";

import { useState, useMemo } from "react";
import clsx from "clsx";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.min.css";

const apiExamples = [
  {
    id: "api-integration",
    label: "API Integration Flow",
    command: `import {
  OpenAPI,
  QuoteRequest,
  SFA,
  OneClickStatus,
  type QuoteResponse,
  type TokenResponse,
} from "@stableflow/core";
import { ethers } from "ethers";

// Configure JWT before API calls
OpenAPI.TOKEN = "your-jwt-token";

// 1. Get supported tokens
const allTokens = await SFA.getTokens();
const fromToken = allTokens.find(
  (t) => t.blockchain === "eth" && t.symbol === "USDT"
)!;
const toToken = allTokens.find(
  (t) => t.blockchain === "arb" && t.symbol === "USDT"
)!;

// 2. Request executable quote (dry: false returns depositAddress)
const quoteRes: QuoteResponse = await SFA.getQuote({
  dry: false,
  swapType: QuoteRequest.swapType.EXACT_INPUT,
  slippageTolerance: 50, // basis points: 50 = 0.5%
  originAsset: fromToken.assetId,
  destinationAsset: toToken.assetId,
  amount: "1000000", // smallest unit (e.g. 1 USDT with 6 decimals)
  refundTo: "0xYourRefundAddress...",
  refundType: QuoteRequest.refundType.ORIGIN_CHAIN,
  recipient: "0xYourRecipientAddress...",
  recipientType: QuoteRequest.recipientType.DESTINATION_CHAIN,
  depositType: QuoteRequest.depositType.ORIGIN_CHAIN,
  deadline: new Date(Date.now() + 3600_000).toISOString(),
});

if (!quoteRes.quote.depositAddress) {
  throw new Error("Missing deposit address");
}

// 3. Send deposit with your own wallet (not part of SDK)
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const tokenContract = new ethers.Contract(
  fromToken.contractAddress!,
  ["function transfer(address to, uint256 amount) returns (bool)"],
  signer
);
const tx = await tokenContract.transfer(
  quoteRes.quote.depositAddress,
  "1000000"
);

// 4. Submit source-chain tx hash (optional, speeds up matching)
await SFA.submitDepositTx({
  txHash: tx.hash,
  depositAddress: quoteRes.quote.depositAddress,
});

// 5. Poll execution status
const status = await SFA.getExecutionStatus(
  quoteRes.quote.depositAddress,
  quoteRes.quote.depositMemo
);

if (
  [
    OneClickStatus.PENDING_DEPOSIT,
    OneClickStatus.KNOWN_DEPOSIT_TX,
    OneClickStatus.INCOMPLETE_DEPOSIT,
    OneClickStatus.PROCESSING,
  ].includes(status.status)
) {
  // Still processing
}
if (status.status === OneClickStatus.SUCCESS) {
  // Success
}
if (
  [OneClickStatus.FAILED, OneClickStatus.REFUNDED].includes(status.status)
) {
  // Failed or refunded
}`,
    response: `// Step 1: TokenResponse[]
[
  {
    "assetId": "nep141:eth-...",
    "decimals": 6,
    "blockchain": "eth",
    "symbol": "USDT",
    "price": 1.0,
    "contractAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  }
]

// Step 2: QuoteResponse (dry: false)
{
  "timestamp": "...",
  "signature": "...",
  "quote": {
    "depositAddress": "0x...",
    "depositMemo": null,
    "amountIn": "1000000",
    "amountOut": "997500",
    "timeEstimate": 180
  }
}

// Step 4: SubmitDepositTxResponse
{
  "status": "KNOWN_DEPOSIT_TX",
  "quoteResponse": { ... },
  "swapDetails": { ... }
}

// Step 5: GetExecutionStatusResponse
{
  "status": "SUCCESS",
  "updatedAt": "...",
  "swapDetails": { ... }
}`,
  },
  {
    id: "quote",
    label: "Get quotes",
    command: `import Big from "big.js";
import { BridgeSFA, type GetAllQuoteParams } from "@stableflow/bridges";
import { tokens } from "@stableflow/core";
import { EVMWallet } from "@stableflow/wallet-evm";
import { ethers } from "ethers";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const fromWallet = new EVMWallet(provider, signer);
const fromWalletAddress = await signer.getAddress();

const fromToken = tokens.find(
  (t) => t.chainName === "Ethereum" && t.symbol === "USDT"
)!;
const toToken = tokens.find(
  (t) => t.chainName === "Arbitrum" && t.symbol === "USDT"
)!;

const quoteRequest: GetAllQuoteParams = {
  dry: false,
  prices: {},
  fromToken,
  toToken,
  wallet: fromWallet,
  recipient: "0xRecipientAddress...",
  refundTo: fromWalletAddress,
  amountWei: Big("100")
    .times(10 ** fromToken.decimals)
    .toFixed(0, 0),
  slippageTolerance: 0.5, // percentage: 0.5 = 0.5%
  oneclickParams: {
    appFees: [
      {
        recipient: "stableflow.near",
        fee: 100, // 1%
      },
    ],
  },
};

const quotes = await BridgeSFA.getAllQuote(quoteRequest);`,
    response: `[
  {
    "serviceType": "oneclick",
    "quote": {
      "quote": {...},
      "quoteParam": {...},
      "sendParam": {...},
      "needApprove": true,
      "approveSpender": "0x...",
      "fees": {...},
      "outputAmount": "99750000000",
      "estimateTime": 1800
    }
  },
  {
    "serviceType": "cctp",
    "quote": {...}
  },
  {
    "serviceType": "usdt0",
    "error": "Amount exceeds max"
  }
]`,
  },
  {
    id: "execute",
    label: "Execute a quote",
    command: `import { BridgeSFA, getQuoteModes } from "@stableflow/bridges";
import { EVMWallet } from "@stableflow/wallet-evm";
import { ethers } from "ethers";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const fromWallet = new EVMWallet(provider, signer);

const selectedRoute = quotes.find((q) => q.quote && !q.error);
if (!selectedRoute?.quote) throw new Error("No valid route");

const { isExactOutput } = getQuoteModes({
  quoteData: selectedRoute.quote,
  bridgeStore: { quoteDataService: selectedRoute.serviceType },
});

const amountToApprove = isExactOutput
  ? selectedRoute.quote.quote?.amountIn
  : selectedRoute.quote.quoteParam.amountWei;

if (selectedRoute.quote.needApprove && fromWallet.approve) {
  const approveRes = await fromWallet.approve({
    contractAddress:
      selectedRoute.quote.quoteParam.fromToken.contractAddress,
    spender: selectedRoute.quote.approveSpender,
    amountWei: amountToApprove,
    isDetails: true,
  });
  if (!approveRes.success) {
    throw new Error(approveRes.message || "Approve failed");
  }
}

const txHash = await BridgeSFA.send(selectedRoute.serviceType, {
  wallet: fromWallet,
  quote: selectedRoute.quote,
  // permitSignature required when quote.needPermit === true
});

console.log("Transaction hash:", txHash);`,
    response: `"0xabc123def456..."`,
  },
  {
    id: "status",
    label: "Check status",
    command: `import { BridgeSFA } from "@stableflow/bridges";

// Persist the same quote object from getAllQuote({ dry: false })
// that you passed to BridgeSFA.send
const status = await BridgeSFA.getStatus(finalRoute.serviceType, {
  quote: finalRoute.quote,
  hash: txHash, // source-chain tx hash from send (required)
});

console.log("Status:", status.status);
// "pending" | "success" | "failed"
if (status.toChainTxHash) {
  console.log("Destination chain tx hash:", status.toChainTxHash);
}`,
    response: `{
  "status": "success",
  "toChainTxHash": "0xdef789..."
}`,
  },
  {
    id: "chains",
    label: "Token Configuration",
    command: `import { tokens } from "@stableflow/core";

// All supported tokens (TokenConfig[])
const allTokens = tokens;

// Filter by symbol
const usdtTokens = tokens.filter((t) => t.symbol === "USDT");
const usdcTokens = tokens.filter((t) => t.symbol === "USDC");

// Find by chain name and symbol
const ethUsdt = tokens.find(
  (t) => t.chainName === "Ethereum" && t.symbol === "USDT"
);

// Filter by chain type
const evmTokens = tokens.filter((t) => t.chainType === "evm");
const solanaTokens = tokens.filter((t) => t.chainType === "sol");

// For HTTP API, use SFA.getTokens() for TokenResponse[] with assetId
import { SFA } from "@stableflow/core";
const apiTokens = await SFA.getTokens();`,
    response: `[
  {
    "chainName": "Ethereum",
    "chainType": "evm",
    "symbol": "USDT",
    "decimals": 6,
    "contractAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "assetId": "nep141:eth-...",
    "services": ["oneclick", "usdt0"]
  }
]`,
  },
  {
    id: "affiliate",
    label: "Developer Fees",
    command: `import { BridgeSFA } from "@stableflow/bridges";

// Include appFees when requesting quotes (OneClick routes only)
const quotes = await BridgeSFA.getAllQuote({
  // ... other GetAllQuoteParams
  oneclickParams: {
    appFees: [
      {
        recipient: "yourapp.near",
        fee: 100, // 1% (100 = 1%, 50 = 0.5%, 10 = 0.10%, 1 = 0.01%)
      },
    ],
  },
});

// Multi-party revenue sharing
oneclickParams: {
  appFees: [
    { recipient: "yourapp.near", fee: 70 },
    { recipient: "kol.near", fee: 30 },
  ],
}`,
    response: `// Fees are automatically embedded in the execution path
// 1% of the user's transfer amount will be routed
// directly to your wallet when the transaction executes.

// No custody. No settlement process. No off-chain accounting.`,
  },
  {
    id: "hyperliquid",
    label: "Hyperliquid",
    command: `import Big from "big.js";
import { OpenAPI } from "@stableflow/core";
import {
  Hyperliquid,
  HyperliquidFromTokens,
  HyperliuquidToToken,
  HyperliuquidMinAmount,
} from "@stableflow/hyperliquid";
import { EVMWallet } from "@stableflow/wallet-evm";
import { ethers } from "ethers";

OpenAPI.TOKEN = "your-jwt-token";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const fromWallet = new EVMWallet(provider, signer);
const address = await signer.getAddress();

const fromToken = HyperliquidFromTokens.find(
  (t) => t.chainType === "evm"
)!;
const amountWei = Big(amount)
  .times(10 ** fromToken.decimals)
  .toFixed(0, 0);

if (Big(amountWei).lt(HyperliuquidMinAmount)) {
  throw new Error(\`Min amount is \${HyperliuquidMinAmount}\`);
}

const quoteParams = {
  slippageTolerance: 0.5, // percentage: 0.5 = 0.5%
  refundTo: address,
  recipient: address,
  wallet: fromWallet,
  fromToken,
  prices: {},
  amountWei,
};

// 1. Preview quote
const preview = await Hyperliquid.quote({ ...quoteParams, dry: true });
if (preview.error) throw new Error(preview.error);

// 2. Executable quote
const finalQuote = await Hyperliquid.quote({ ...quoteParams, dry: false });
if (!finalQuote.quote) throw new Error(finalQuote.error || "No quote");

// 3. Transfer on source chain
const txhash = await Hyperliquid.transfer({
  wallet: fromWallet,
  evmWallet: fromWallet,
  evmWalletAddress: address,
  quote: finalQuote.quote,
});

// 4. Submit deposit (Arbitrum USDC permit signed internally)
const depositRes = await Hyperliquid.deposit({
  txhash,
  wallet: fromWallet,
  evmWallet: fromWallet,
  evmWalletAddress: address,
  quote: finalQuote.quote,
});

// 5. Poll status
const statusRes = await Hyperliquid.getStatus({
  depositId: String(depositRes.data.depositId),
});
// statusRes.data.status: "PROCESSING" | "SUCCESS" | "REFUNDED" | "FAILED"`,
    response: `// Quote response
{
  "quote": {
    "quote": {...},
    "quoteParam": {...},
    "sendParam": {...},
    "amountOut": "..."
  },
  "error": null
}

// Deposit response
{
  "code": 200,
  "data": { "depositId": 12345 }
}

// Status response
{
  "code": 200,
  "data": {
    "status": "SUCCESS",
    "txHash": "0x..."
  }
}`,
  },
];

const ApiPlayground = () => {
  const [activeTab, setActiveTab] = useState("api-integration");
  const activeExample = apiExamples.find((ex) => ex.id === activeTab);

  // Highlight TypeScript code
  const highlightedCommand = useMemo(() => {
    if (!activeExample?.command) return "";
    try {
      return hljs.highlight(activeExample.command, { language: "typescript" }).value;
    } catch {
      return activeExample.command;
    }
  }, [activeExample?.command]);

  // Highlight response (JSON or TypeScript comments)
  const highlightedResponse = useMemo(() => {
    if (!activeExample?.response) return "";
    try {
      // Check if it's JSON
      if (activeExample.response.trim().startsWith("{") || activeExample.response.trim().startsWith("[")) {
        return hljs.highlight(activeExample.response, { language: "json" }).value;
      }
      // Check if it's mostly comments
      if (activeExample.response.trim().startsWith("//")) {
        return hljs.highlight(activeExample.response, { language: "typescript" }).value;
      }
      // Default to JSON
      return hljs.highlight(activeExample.response, { language: "json" }).value;
    } catch {
      return activeExample.response;
    }
  }, [activeExample?.response]);

  return (
    <section className="pt-16 md:pt-20">
      <div className="">
        <h2 className="text-2xl font-semibold text-black leading-[100%]">
          Try the StableFlow API
        </h2>
        <p className="text-[#9FA7BA] text-md font-normal mt-4.5">
          Explore real API calls and inspect the response structure.
        </p>
      </div>

      <div className="mt-4 rounded-2xl bg-white shadow-[0_0_10px_0_rgba(0,0,0,0.10)] py-6 px-2 md:px-8 grid lg:grid-cols-[190px_1fr] gap-6 lg:gap-12">
        {/* Left side - Tabs */}
        <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
          {apiExamples.map((example) => (
            <button
              key={example.id}
              type="button"
              onClick={() => setActiveTab(example.id)}
              className={clsx(
                "pl-8 pr-4 py-2.5 text-black text-left text-sm font-normal rounded-lg transition-colors whitespace-nowrap cursor-pointer border border-white",
                activeTab === example.id
                  ? "bg-black text-white"
                  : "hover:text-[#2B3337] hover:border-[#D9D9D9]"
              )}
            >
              {example.label}
            </button>
          ))}
        </div>

        {/* Right side - Code */}
        <div className="min-w-0 flex-1">
          <div className="bg-[#0f172a] rounded-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-slate-600" />
                  <div className="w-3 h-3 rounded-full bg-slate-600" />
                  <div className="w-3 h-3 rounded-full bg-slate-600" />
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  TypeScript
                </span>
              </div>
            </div>

            {/* Command */}
            <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/30">
              <pre className="overflow-x-auto">
                <code 
                  className="text-sm font-mono leading-relaxed hljs language-typescript"
                  dangerouslySetInnerHTML={{ __html: highlightedCommand }}
                />
              </pre>
            </div>

            {/* Response */}
            <div className="px-4 py-3">
              <div className="text-xs text-slate-500 mb-2 font-mono">
                Response
              </div>
              <pre className="overflow-x-auto">
                <code 
                  className="text-sm font-mono leading-relaxed hljs"
                  dangerouslySetInnerHTML={{ __html: highlightedResponse }}
                />
              </pre>
            </div>
          </div>
          <p className="text-xs text-[#9FA7BA] mt-3">
            All responses are returned in real time with zero platform fees.
          </p>
        </div>
      </div>
    </section>
  );
}

export default ApiPlayground;
