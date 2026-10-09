import type { Service } from "@/all-tokens/constants";
import { getStableflowChainLogo } from "@/utils/format/logo";
import { PROXY_RPC_DOMAIN } from "@/config/api";

export const chainTypes: Record<string, { value: string; name: string; color: string; bg: string; bgColor: string; icon: string; iconGray: string; }> = {
  near: {
    value: "near",
    name: "Near",
    color: "#56DEAD",
    bgColor: "#01ED97",
    bg: "linear-gradient(90deg, rgba(1, 237, 151, 0.20) 0%, rgba(1, 237, 151, 0.00) 50%)",
    icon: getStableflowChainLogo("type-near", "svg"),
    iconGray: getStableflowChainLogo("type-near-gray", "svg"),
  },
  sol: {
    value: "sol",
    name: "Solana",
    color: "#987FF3",
    bgColor: "#282C34",
    bg: "linear-gradient(90deg, rgba(248, 108, 255, 0.20) 0%, rgba(248, 108, 255, 0.00) 50%)",
    icon: getStableflowChainLogo("type-solana", "svg"),
    iconGray: getStableflowChainLogo("type-solana-gray", "svg"),
  },
  evm: {
    value: "evm",
    name: "EVM",
    color: "#C4CAE1",
    bgColor: "#6284F5",
    bg: "linear-gradient(90deg, rgba(185, 215, 255, 0.20) 0%, rgba(185, 215, 255, 0.00) 50%)",
    icon: getStableflowChainLogo("type-evm", "svg"),
    iconGray: getStableflowChainLogo("type-evm-gray", "svg"),
  },
  tron: {
    value: "tron",
    name: "Tron",
    color: "#F66273",
    bgColor: "#D21F10",
    bg: "linear-gradient(90deg, rgba(210, 31, 16, 0.20) 0%, rgba(210, 31, 16, 0.00) 50%)",
    icon: getStableflowChainLogo("type-tron", "svg"),
    iconGray: getStableflowChainLogo("type-tron-gray", "svg"),
  },
  aptos: {
    value: "aptos",
    name: "Aptos",
    color: "#000000",
    bgColor: "#000000",
    bg: "linear-gradient(90deg, rgba(0, 0, 0, 0.20) 0%, rgba(0, 0, 0, 0.00) 50%)",
    icon: getStableflowChainLogo("type-aptos", "svg"),
    iconGray: getStableflowChainLogo("type-aptos-gray", "svg"),
  },
  ton: {
    value: "ton",
    name: "Ton",
    color: "#0098EA",
    bgColor: "#0098EA",
    bg: "linear-gradient(90deg, rgba(0, 152, 234, 0.20) 0%, rgba(0, 152, 234, 0.00) 50%)",
    icon: getStableflowChainLogo("type-ton", "svg"),
    iconGray: getStableflowChainLogo("type-ton-gray", "svg"),
  },
  sui: {
    value: "sui",
    name: "Sui",
    color: "#298DFF",
    bgColor: "#298DFF",
    bg: "linear-gradient(90deg, rgba(41, 141, 255, 0.20) 0%, rgba(0, 152, 234, 0.00) 50%)",
    icon: getStableflowChainLogo("type-sui", "svg"),
    iconGray: getStableflowChainLogo("type-sui-gray", "svg"),
  },
  btc: {
    value: "btc",
    name: "Bitcoin",
    color: "#F7931A",
    bgColor: "#F7931A",
    bg: "linear-gradient(90deg, rgba(247, 147, 26, 0.20) 0%, rgba(247, 147, 26, 0.00) 50%)",
    icon: getStableflowChainLogo("type-btc", "svg"),
    iconGray: getStableflowChainLogo("type-btc-gray", "svg"),
  },
  zcash: {
    value: "zcash",
    name: "Zcash",
    color: "#F4B728",
    bgColor: "#F4B728",
    bg: "linear-gradient(90deg, rgba(244, 183, 40, 0.20) 0%, rgba(244, 183, 40, 0.00) 50%)",
    icon: getStableflowChainLogo("type-zcash", "svg"),
    iconGray: getStableflowChainLogo("type-zcash-gray", "svg"),
  },
};

const HeliusRpcApiKey = import.meta.env.VITE_HELIUS_RPC_API_KEY;
const AlchemyRpcApiKey = import.meta.env.VITE_ALCHEMY_RPC_API_KEY;

const ProxyRpcHost = `https://${PROXY_RPC_DOMAIN}/rpc`;

export const chainsRpcUrls: Record<string, string[]> = {
  "Ethereum": [
    `${ProxyRpcHost}/ethereum`,
    "https://0xrpc.io/eth",
    "https://ethereum-rpc.publicnode.com",
  ],
  "Arbitrum": [
    `${ProxyRpcHost}/arbitrum`,
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum-one-rpc.publicnode.com",
  ],
  "BNB Chain": [
    `${ProxyRpcHost}/bsc`,
    "https://56.rpc.thirdweb.com",
    "https://bsc-rpc.publicnode.com",
  ],
  "Avalanche": [
    `${ProxyRpcHost}/avalanche`,
    "https://api.avax.network/ext/bc/C/rpc",
    "https://avalanche-c-chain-rpc.publicnode.com",
  ],
  "Base": [
    `${ProxyRpcHost}/base`,
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
  ],
  "Polygon": [
    `${ProxyRpcHost}/polygon`,
    "https://polygon.drpc.org",
    "https://polygon-bor-rpc.publicnode.com",
  ],
  "Gnosis": [
    `${ProxyRpcHost}/gnosis`,
    "https://rpc.gnosischain.com",
    "https://gnosis-rpc.publicnode.com",
  ],
  "Optimism": [
    `${ProxyRpcHost}/optimism`,
    "https://mainnet.optimism.io",
    "https://optimism-rpc.publicnode.com",
  ],
  "Berachain": [
    `${ProxyRpcHost}/berachain`,
    "https://rpc.berachain.com",
    "https://berachain-rpc.publicnode.com",
  ],
  "Monad": [
    `${ProxyRpcHost}/monad`,
    "https://rpc.monad.xyz",
    "https://rpc1.monad.xyz",
  ],
  "Tron": [
    `${ProxyRpcHost}/tron`,
    "https://tron-rpc.publicnode.com",
  ],
  "Aptos": [
    "https://api.mainnet.aptoslabs.com/v1",
  ],
  "Solana": [
    `${ProxyRpcHost}/solana`,
    `https://mainnet.helius-rpc.com/?api-key=${HeliusRpcApiKey}`,
    `https://solana-mainnet.g.alchemy.com/v2/${AlchemyRpcApiKey}`,
    "https://solana-rpc.publicnode.com",
  ],
  "Near": [
    "https://nearinner.deltarpc.com",
    "https://free.rpc.fastnear.com",
  ],
  "X Layer": [
    `${ProxyRpcHost}/xlayer`,
    "https://rpc.xlayer.tech",
    "https://xlayer.drpc.org",
  ],
  "Plasma": [
    `${ProxyRpcHost}/plasma`,
    "https://rpc.plasma.to",
    "https://plasma.drpc.org",
  ],
  "Mantle": [
    `${ProxyRpcHost}/mantle`,
    "https://rpc.mantle.xyz",
    "https://mantle-rpc.publicnode.com",
  ],
  "MegaETH": [
    `${ProxyRpcHost}/megaeth`,
    "https://mainnet.megaeth.com/rpc",
  ],
  "Ink": [
    `${ProxyRpcHost}/ink`,
    "https://rpc-gel.inkonchain.com",
    "https://rpc-qnd.inkonchain.com",
  ],
  "Stable": [
    `${ProxyRpcHost}/stable`,
    "https://rpc.stable.xyz",
  ],
  "Celo": [
    `${ProxyRpcHost}/celo`,
    "https://forno.celo.org",
    "https://celo-rpc.publicnode.com",
  ],
  "Sei": [
    `${ProxyRpcHost}/sei`,
    "https://sei-evm-rpc.publicnode.com",
  ],
  "Flare": [
    "https://flare-api.flare.network/ext/C/rpc",
  ],
  "Fraxtal": [
    `${ProxyRpcHost}/fraxtal`,
    "https://rpc.frax.com",
  ],
  "Ton": [
    "https://toncenter.com/api/v2/jsonRPC",
  ],
  "Sui": [
    // `${ProxyRpcHost}/sui`,
    "https://fullnode.mainnet.sui.io:443",
  ],
  "Katana": [
    `${ProxyRpcHost}/katana`,
    "https://rpc.katana.network",
    "https://katana.drpc.org",
  ],
  "Pharos": [
    `${ProxyRpcHost}/pharos`,
    "https://rpc.pharos.xyz",
  ],
};

export const getChainRpcUrl = (chainName: string): { rpcUrls: string[]; rpcUrl: string; } => {
  return {
    rpcUrls: chainsRpcUrls[chainName],
    rpcUrl: chainsRpcUrls[chainName][0],
  };
};

export type ChainType = {
  chainName: string;
  chainId?: number;
  blockchain: string;
  chainIcon: string;
  chainIconGray: string;
  chainType: string;
  blockExplorerUrl: string;
  blockExplorerUrls: string[];
  primaryColor: string;
  nativeToken: {
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  rpcUrl: string;
  /** When true, chain appears in trading / token pickers */
  tradeEnabled?: boolean;
  /** When true, chain appears in wallet connect UI */
  walletEnabled?: boolean;
  /** Rhea HTTP/SDK chain id for quote/swap (fallback: chainId / blockchain) */
  rheaHttpChainId?: string;
};

/**
 * Rhea trade/wallet flags keyed by chains local key.
 *
 * Local config is the only allowlist. Tokens from chains not listed here
 * (or with tradeEnabled: false) are dropped even if the Rhea API returns them.
 *
 * To support a new Rhea chain:
 * 1. Add an entry here with tradeEnabled / walletEnabled / rheaHttpChainId
 * 2. Add full chains.<key> metadata below (alias, icons, RPC, explorer, native)
 * 3. For EVM: also register the chain in RainbowKit/wagmi (rainbow/provider.tsx)
 * 4. Add RPC URLs to chainsRpcUrls if needed
 * 5. Add native token id to RHEA_NATIVE_TOKEN_IDS when applicable
 * 6. Non-EVM: ensure wallet adapter exists in RHEA_WALLET_TYPES / providers
 */
const RHEA_META: Record<
  string,
  { tradeEnabled: boolean; walletEnabled: boolean; rheaHttpChainId: string }
> = {
  eth: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "1" },
  bsc: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "56" },
  arb: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "42161" },
  base: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "8453" },
  op: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "10" },
  bera: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "80094" },
  monad: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "143" },
  xlayer: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "196" },
  pol: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "137" },
  gnosis: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "100" },
  plasma: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "9745" },
  sol: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "solana" },
  near: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "near" },
  aptos: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "aptos" },
  tron: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "tron" },
  sui: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "sui" },
  ton: { tradeEnabled: false, walletEnabled: false, rheaHttpChainId: "ton" },
  btc: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "btc" },
  zcash: { tradeEnabled: true, walletEnabled: true, rheaHttpChainId: "zcash" },
};

const chains: Record<string, ChainType> = {
  near: {
    chainName: "Near",
    blockchain: "near", // https://1click.chaindefuser.com/v0/tokens blockchain
    chainIcon: getStableflowChainLogo("near"),
    chainIconGray: getStableflowChainLogo("near-gray"),
    chainType: chainTypes.near.value,
    blockExplorerUrl: "https://nearblocks.io/txns",
    blockExplorerUrls: ["https://nearblocks.io"],
    primaryColor: "#76EA9E",
    nativeToken: {
      symbol: "NEAR",
      decimals: 24,
    },
    ...getChainRpcUrl("Near"),
  },
  sol: {
    chainName: "Solana",
    blockchain: "sol",
    chainIcon: getStableflowChainLogo("solana"),
    chainIconGray: getStableflowChainLogo("solana-gray"),
    chainType: chainTypes.sol.value,
    blockExplorerUrl: "https://solscan.io/tx",
    blockExplorerUrls: ["https://solscan.io"],
    primaryColor: "#B93EF0",
    nativeToken: {
      symbol: "SOL",
      decimals: 9,
    },
    ...getChainRpcUrl("Solana"),
  },
  eth: {
    chainName: "Ethereum",
    blockchain: "eth",
    chainIcon: getStableflowChainLogo("Ethereum"),
    chainIconGray: getStableflowChainLogo("Ethereum-gray"),
    chainType: chainTypes.evm.value,
    chainId: 1,
    blockExplorerUrl: "https://etherscan.io/tx",
    blockExplorerUrls: ["https://etherscan.io"],
    primaryColor: "#7083ee",
    nativeToken: {
      symbol: "ETH",
      decimals: 18,
    },
    ...getChainRpcUrl("Ethereum"),
  },
  arb: {
    chainName: "Arbitrum",
    blockchain: "arb",
    chainIcon: getStableflowChainLogo("Arbitrum"),
    chainIconGray: getStableflowChainLogo("Arbitrum-gray"),
    chainType: chainTypes.evm.value,
    chainId: 42161,
    blockExplorerUrl: "https://arbiscan.io/tx",
    blockExplorerUrls: ["https://arbiscan.io"],
    primaryColor: "#4763A7",
    nativeToken: {
      symbol: "ETH",
      decimals: 18,
    },
    ...getChainRpcUrl("Arbitrum"),
  },
  bsc: {
    chainName: "BNB Chain",
    blockchain: "bsc",
    chainIcon: getStableflowChainLogo("bsc"),
    chainIconGray: getStableflowChainLogo("bsc-gray"),
    chainType: chainTypes.evm.value,
    chainId: 56,
    blockExplorerUrl: "https://bscscan.com/tx",
    blockExplorerUrls: ["https://bscscan.com"],
    primaryColor: "#F1C144",
    nativeToken: {
      symbol: "BNB",
      decimals: 18,
    },
    ...getChainRpcUrl("BNB Chain"),
  },
  avax: {
    chainName: "Avalanche",
    blockchain: "avax",
    chainIcon: getStableflowChainLogo("Avalanche"),
    chainIconGray: getStableflowChainLogo("Avalanche-gray"),
    chainType: chainTypes.evm.value,
    chainId: 43114,
    blockExplorerUrl: "https://snowtrace.io/tx",
    blockExplorerUrls: ["https://snowtrace.io"],
    primaryColor: "#9D2620",
    nativeToken: {
      symbol: "AVAX",
      decimals: 18,
    },
    ...getChainRpcUrl("Avalanche"),
  },
  base: {
    chainName: "Base",
    blockchain: "base",
    chainIcon: getStableflowChainLogo("base-2"),
    chainIconGray: getStableflowChainLogo("Base-gray"),
    chainType: chainTypes.evm.value,
    chainId: 8453,
    blockExplorerUrl: "https://basescan.org/tx",
    blockExplorerUrls: ["https://basescan.org"],
    primaryColor: "#3137F6",
    nativeToken: {
      symbol: "ETH",
      decimals: 18,
    },
    ...getChainRpcUrl("Base"),
  },
  pol: {
    chainName: "Polygon",
    blockchain: "pol",
    chainIcon: getStableflowChainLogo("Polygon"),
    chainIconGray: getStableflowChainLogo("Polygon-gray"),
    chainType: chainTypes.evm.value,
    chainId: 137,
    blockExplorerUrl: "https://polygonscan.com/tx",
    blockExplorerUrls: ["https://polygonscan.com"],
    primaryColor: "#5A2AD1",
    nativeToken: {
      symbol: "POL",
      decimals: 18,
    },
    ...getChainRpcUrl("Polygon"),
  },
  gnosis: {
    chainName: "Gnosis",
    blockchain: "gnosis",
    chainIcon: getStableflowChainLogo("Gnosis"),
    chainIconGray: getStableflowChainLogo("Gnosis-gray"),
    chainType: chainTypes.evm.value,
    chainId: 100,
    blockExplorerUrl: "https://gnosisscan.io/tx",
    blockExplorerUrls: ["https://gnosisscan.io"],
    primaryColor: "#285230",
    nativeToken: {
      symbol: "XDAI",
      decimals: 18,
    },
    ...getChainRpcUrl("Gnosis"),
  },
  op: {
    chainName: "Optimism",
    blockchain: "op",
    chainIcon: getStableflowChainLogo("Optimism"),
    chainIconGray: getStableflowChainLogo("Optimism-gray"),
    chainType: chainTypes.evm.value,
    chainId: 10,
    blockExplorerUrl: "https://optimistic.etherscan.io/tx",
    blockExplorerUrls: ["https://optimistic.etherscan.io"],
    primaryColor: "#B5271D",
    nativeToken: {
      symbol: "ETH",
      decimals: 18,
    },
    ...getChainRpcUrl("Optimism"),
  },
  tron: {
    chainName: "Tron",
    blockchain: "tron",
    chainIcon: getStableflowChainLogo("Tron"),
    chainIconGray: getStableflowChainLogo("Tron-gray"),
    chainType: chainTypes.tron.value,
    blockExplorerUrl: "https://tronscan.org/#/transaction",
    blockExplorerUrls: ["https://tronscan.org"],
    primaryColor: "#BC3221",
    nativeToken: {
      symbol: "TRX",
      decimals: 6,
    },
    ...getChainRpcUrl("Tron"),
  },
  aptos: {
    chainName: "Aptos",
    blockchain: "aptos",
    chainIcon: getStableflowChainLogo("Aptos"),
    chainIconGray: getStableflowChainLogo("Aptos-gray"),
    chainType: chainTypes.aptos.value,
    blockExplorerUrl: "https://aptoscan.com/transaction",
    blockExplorerUrls: ["https://aptoscan.com"],
    primaryColor: "#000000",
    nativeToken: {
      symbol: "APT",
      decimals: 8,
    },
    ...getChainRpcUrl("Aptos"),
  },
  bera: {
    chainName: "Berachain",
    blockchain: "bera",
    chainIcon: getStableflowChainLogo("Berachain"),
    chainIconGray: getStableflowChainLogo("Berachain-gray"),
    chainType: chainTypes.evm.value,
    chainId: 80094,
    blockExplorerUrl: "https://berascan.com/tx",
    blockExplorerUrls: ["https://berascan.com"],
    primaryColor: "#F37325",
    nativeToken: {
      symbol: "BERA",
      decimals: 18,
    },
    ...getChainRpcUrl("Berachain"),
  },
  monad: {
    chainName: "Monad",
    blockchain: "monad",
    chainIcon: getStableflowChainLogo("Monad"),
    chainIconGray: getStableflowChainLogo("Monad-gray"),
    chainType: chainTypes.evm.value,
    chainId: 143,
    blockExplorerUrl: "https://monadvision.com/tx",
    blockExplorerUrls: ["https://monadvision.com"],
    primaryColor: "#836EF9",
    nativeToken: {
      symbol: "MON",
      decimals: 18,
    },
    ...getChainRpcUrl("Monad"),
  },
  xlayer: {
    chainName: "X Layer",
    blockchain: "xlayer",
    chainIcon: getStableflowChainLogo("xlayer"),
    chainIconGray: getStableflowChainLogo("xlayer-gray"),
    chainType: chainTypes.evm.value,
    chainId: 196,
    blockExplorerUrl: "https://www.oklink.com/xlayer/tx",
    blockExplorerUrls: ["https://www.oklink.com"],
    primaryColor: "#000000",
    nativeToken: {
      symbol: "OKB",
      decimals: 18,
    },
    ...getChainRpcUrl("X Layer"),
  },
  plasma: {
    chainName: "Plasma",
    blockchain: "plasma",
    chainIcon: getStableflowChainLogo("Plasma"),
    chainIconGray: getStableflowChainLogo("Plasma-gray"),
    chainType: chainTypes.evm.value,
    chainId: 9745,
    blockExplorerUrl: "https://plasmascan.to/tx",
    blockExplorerUrls: ["https://plasmascan.to"],
    primaryColor: "#162F29",
    nativeToken: {
      symbol: "XPL",
      decimals: 18,
    },
    ...getChainRpcUrl("Plasma"),
  },
  ton: {
    chainName: "Ton",
    blockchain: "ton",
    chainIcon: getStableflowChainLogo("Ton"),
    chainIconGray: getStableflowChainLogo("Ton-gray"),
    chainType: chainTypes.ton.value,
    blockExplorerUrl: "https://tonviewer.com/transaction",
    blockExplorerUrls: ["https://tonviewer.com"],
    primaryColor: "#0098EA",
    nativeToken: {
      symbol: "TON",
      decimals: 9,
    },
    ...getChainRpcUrl("Ton"),
  },
  mantle: {
    chainName: "Mantle",
    blockchain: "mantle",
    chainIcon: getStableflowChainLogo("Mantle"),
    chainIconGray: getStableflowChainLogo("Mantle-gray"),
    chainType: chainTypes.evm.value,
    chainId: 5000,
    blockExplorerUrl: "https://mantlescan.xyz/tx",
    blockExplorerUrls: ["https://mantlescan.xyz"],
    primaryColor: "#162F29",
    nativeToken: {
      symbol: "MNT",
      decimals: 18,
    },
    ...getChainRpcUrl("Mantle"),
  },
  megaeth: {
    chainName: "MegaETH",
    blockchain: "megaeth",
    chainIcon: getStableflowChainLogo("MegaETH"),
    chainIconGray: getStableflowChainLogo("MegaETH-gray"),
    chainType: chainTypes.evm.value,
    chainId: 4326,
    blockExplorerUrl: "https://mega.etherscan.io/tx",
    blockExplorerUrls: ["https://mega.etherscan.io"],
    primaryColor: "#19191A",
    nativeToken: {
      symbol: "ETH",
      decimals: 18,
    },
    ...getChainRpcUrl("MegaETH"),
  },
  ink: {
    chainName: "Ink",
    blockchain: "ink",
    chainIcon: getStableflowChainLogo("Ink"),
    chainIconGray: getStableflowChainLogo("Ink-gray"),
    chainType: chainTypes.evm.value,
    chainId: 57073,
    blockExplorerUrl: "https://explorer.inkonchain.com/tx",
    blockExplorerUrls: ["https://explorer.inkonchain.com"],
    primaryColor: "#7132F5",
    nativeToken: {
      symbol: "ETH",
      decimals: 18,
    },
    ...getChainRpcUrl("Ink"),
  },
  stable: {
    chainName: "Stable",
    blockchain: "stable",
    chainIcon: getStableflowChainLogo("Stable"),
    chainIconGray: getStableflowChainLogo("Stable-gray"),
    chainType: chainTypes.evm.value,
    chainId: 988,
    blockExplorerUrl: "https://uniscan.xyz/tx",
    blockExplorerUrls: ["https://uniscan.xyz"],
    primaryColor: "#01241D",
    nativeToken: {
      symbol: "USDT0",
      decimals: 18,
    },
    ...getChainRpcUrl("Stable"),
  },
  celo: {
    chainName: "Celo",
    blockchain: "celo",
    chainIcon: getStableflowChainLogo("Celo"),
    chainIconGray: getStableflowChainLogo("Celo-gray"),
    chainType: chainTypes.evm.value,
    chainId: 42_220,
    blockExplorerUrl: "https://celoscan.io/tx",
    blockExplorerUrls: ["https://celoscan.io"],
    primaryColor: "#FCFF52",
    nativeToken: {
      symbol: "CELO",
      decimals: 18,
    },
    ...getChainRpcUrl("Celo"),
  },
  sei: {
    chainName: "Sei",
    blockchain: "sei",
    chainIcon: getStableflowChainLogo("Sei"),
    chainIconGray: getStableflowChainLogo("Sei-gray"),
    chainType: chainTypes.evm.value,
    chainId: 1329,
    blockExplorerUrl: "https://seitrace.com/tx",
    blockExplorerUrls: ["https://seitrace.com"],
    primaryColor: "#991717",
    nativeToken: {
      symbol: "SEI",
      decimals: 18,
    },
    ...getChainRpcUrl("Sei"),
  },
  flare: {
    chainName: "Flare",
    blockchain: "flare",
    chainIcon: getStableflowChainLogo("Flare"),
    chainIconGray: getStableflowChainLogo("Flare-gray"),
    chainType: chainTypes.evm.value,
    chainId: 14,
    blockExplorerUrl: "https://flare-explorer.flare.network/tx",
    blockExplorerUrls: ["https://flare-explorer.flare.network"],
    primaryColor: "#E62058",
    nativeToken: {
      symbol: "FLR",
      decimals: 18,
    },
    ...getChainRpcUrl("Flare"),
  },
  frax: {
    chainName: "Fraxtal",
    blockchain: "frax",
    chainIcon: getStableflowChainLogo("Frax"),
    chainIconGray: getStableflowChainLogo("Frax-gray"),
    chainType: chainTypes.evm.value,
    chainId: 252,
    blockExplorerUrl: "https://fraxscan.com/tx",
    blockExplorerUrls: ["https://fraxscan.com"],
    primaryColor: "#000",
    nativeToken: {
      symbol: "FRAX",
      decimals: 18,
    },
    ...getChainRpcUrl("Fraxtal"),
  },
  sui: {
    chainName: "Sui",
    blockchain: "sui",
    chainIcon: getStableflowChainLogo("Sui"),
    chainIconGray: getStableflowChainLogo("Sui-gray"),
    chainType: chainTypes.sui.value,
    blockExplorerUrl: "https://suiscan.xyz/mainnet/tx",
    blockExplorerUrls: ["https://suiscan.xyz/mainnet"],
    primaryColor: "#298DFF",
    nativeToken: {
      symbol: "SUI",
      decimals: 9,
    },
    ...getChainRpcUrl("Sui"),
  },
  katana: {
    chainName: "Katana",
    blockchain: "katana",
    chainIcon: getStableflowChainLogo("Katana"),
    chainIconGray: getStableflowChainLogo("Katana-gray"),
    chainType: chainTypes.evm.value,
    chainId: 747474,
    blockExplorerUrl: "https://katanascan.com/tx",
    blockExplorerUrls: ["https://katanascan.com"],
    primaryColor: "#F6FF0D",
    nativeToken: {
      symbol: "ETH",
      decimals: 18,
    },
    ...getChainRpcUrl("Katana"),
  },
  pharos: {
    chainName: "Pharos",
    blockchain: "pharos",
    chainIcon: getStableflowChainLogo("Pharos"),
    chainIconGray: getStableflowChainLogo("Pharos-gray"),
    chainType: chainTypes.evm.value,
    chainId: 1672,
    blockExplorerUrl: "https://www.pharosscan.xyz/tx",
    blockExplorerUrls: ["https://www.pharosscan.xyz"],
    primaryColor: "#0066FF",
    nativeToken: {
      symbol: "PROS",
      decimals: 18,
    },
    ...getChainRpcUrl("Pharos"),
  },
  btc: {
    chainName: "Bitcoin",
    blockchain: "btc",
    chainIcon: getStableflowChainLogo("bitcoin"),
    chainIconGray: getStableflowChainLogo("bitcoin-gray"),
    chainType: chainTypes.btc.value,
    blockExplorerUrl: "https://mempool.space/tx",
    blockExplorerUrls: ["https://mempool.space"],
    primaryColor: "#F7931A",
    nativeToken: {
      symbol: "BTC",
      decimals: 8,
    },
    rpcUrls: [],
    rpcUrl: "",
  },
  zcash: {
    chainName: "Zcash",
    // API alias is "zec"; rheaHttpChainId stays "zcash" for quote/swap
    blockchain: "zec",
    chainIcon: getStableflowChainLogo("zcash"),
    chainIconGray: getStableflowChainLogo("zcash-gray"),
    chainType: chainTypes.zcash.value,
    blockExplorerUrl: "https://explorer.zcha.in/transactions",
    blockExplorerUrls: ["https://explorer.zcha.in"],
    primaryColor: "#F4B728",
    nativeToken: {
      symbol: "ZEC",
      decimals: 8,
    },
    rpcUrls: [],
    rpcUrl: "",
  },
};

for (const [key, meta] of Object.entries(RHEA_META)) {
  if (chains[key]) {
    Object.assign(chains[key], meta);
  }
}

export default chains;

export type RheaWalletType =
  | "evm"
  | "sol"
  | "near"
  | "tron"
  | "aptos"
  | "sui"
  | "ton"
  | "btc"
  | "zcash";

export type RheaChainConfig = {
  /** Token-query alias used by get_multichain_lending_tokens_data */
  alias: string;
  /** HTTP/SDK chain id for fromChain / toChain */
  httpChainId: string;
  /** Local chains.ts key when available */
  localKey?: string;
  walletType: RheaWalletType;
  /** When false, chain is not shown in token/chain pickers for trading */
  tradeEnabled: boolean;
  /** When false, wallet connect UI is hidden (btc/zcash) */
  walletEnabled: boolean;
  displayName: string;
};

export const RHEA_CHAINS: RheaChainConfig[] = Object.entries(chains).map(([key, c]) => ({
  alias: c.blockchain,
  httpChainId: c.rheaHttpChainId ?? (c.chainId != null ? String(c.chainId) : c.blockchain),
  localKey: key,
  walletType: c.chainType as RheaWalletType,
  tradeEnabled: !!c.tradeEnabled,
  walletEnabled: !!c.walletEnabled,
  displayName: c.chainName,
}));

export const RHEA_TRADE_ALIASES = RHEA_CHAINS.filter((c) => c.tradeEnabled).map((c) => c.alias);

export const RHEA_TOKEN_QUERY_CHAINS = RHEA_TRADE_ALIASES.join(",");

export const RHEA_WALLET_TYPES: RheaWalletType[] = [
  "evm",
  "sol",
  "near",
  "tron",
  "aptos",
  "sui",
  "btc",
  "zcash",
];

const byAlias = new Map(RHEA_CHAINS.map((c) => [c.alias, c]));
const byHttpId = new Map(RHEA_CHAINS.map((c) => [c.httpChainId, c]));
const byLocalKey = new Map(
  RHEA_CHAINS.filter((c) => c.localKey).map((c) => [c.localKey!, c])
);

export const getRheaChainByAlias = (alias: string) => byAlias.get(alias);

export const getRheaChainByHttpId = (httpChainId: string | number) =>
  byHttpId.get(String(httpChainId));

export const getRheaChainByLocalKey = (localKey: string) => byLocalKey.get(localKey);

export const aliasToHttpChainId = (alias: string): string => {
  return byAlias.get(alias)?.httpChainId ?? alias;
};

export const httpChainIdToAlias = (httpChainId: string | number): string => {
  return byHttpId.get(String(httpChainId))?.alias ?? String(httpChainId);
};

/** Native asset token ids per Rhea docs */
export const RHEA_NATIVE_TOKEN_IDS: Record<string, string> = {
  eth: "0x0000000000000000000000000000000000000000",
  bsc: "0x0000000000000000000000000000000000000000",
  arb: "0x0000000000000000000000000000000000000000",
  base: "0x0000000000000000000000000000000000000000",
  op: "0x0000000000000000000000000000000000000000",
  bera: "0x0000000000000000000000000000000000000000",
  monad: "0x0000000000000000000000000000000000000000",
  xlayer: "0x0000000000000000000000000000000000000000",
  pol: "0x0000000000000000000000000000000000000000",
  gnosis: "0x0000000000000000000000000000000000000000",
  plasma: "0x0000000000000000000000000000000000000000",
  sol: "So11111111111111111111111111111111111111112",
  near: "wrap.near",
  aptos: "0xa",
  tron: "trx",
  sui: "0x2::sui::SUI",
  btc: "btc",
  zec: "nep141:zec.omft.near",
};

export interface TokenChain {
  symbol: string;
  decimals: number;
  icon: string;
  assetId?: string;
  contractAddress: string;
  services: Service[];
  price?: number;
  /** Rhea token-query alias (eth, bsc, ...) */
  rheaAlias?: string;
  /** Rhea HTTP/SDK chain id for quote/swap */
  rheaHttpChainId?: string;

  chainName: string;
  blockchain: string;
  chainIcon: string;
  chainIconGray: string;
  chainType: string;
  chainId?: number;
  blockExplorerUrl: string;
  primaryColor: string;
  nativeToken: { symbol: string; decimals: number; };
  rpcUrls: string[];
  rpcUrl: string;
}
