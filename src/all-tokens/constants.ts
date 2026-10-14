import { getStableflowLogo, getStableflowRouteLogo } from "@/utils/format/logo";

export const Service = {
  Rhea: "rhea",
} as const;
export type Service = (typeof Service)[keyof typeof Service];

export const ServiceBackend: Record<Service, string> = {
  [Service.Rhea]: "rhea",
};

export const getRouteStatus = (_service?: Service): { disabled: boolean } => {
  return { disabled: false };
};

export const ServiceLogoMap: Record<Service, string> = {
  [Service.Rhea]: getStableflowRouteLogo("logo-near-intents.svg"),
};

export const ServiceLogoSimpleMap: Record<Service, string> = {
  [Service.Rhea]: getStableflowRouteLogo("logo-near-intents-simple.svg"),
};

/** Router logos for Rhea allQuotes entries. */
export const RouterLogoMap: Record<string, string> = {
  bitget: getStableflowRouteLogo("logo-bitget.svg"),
  okx: getStableflowRouteLogo("logo-okx.svg"),
  binance: getStableflowRouteLogo("logo-binance.svg"),
  "1inch": getStableflowRouteLogo("logo-1inch.svg"),
  paraswap: getStableflowRouteLogo("logo-velora.svg"),
  kodiak: getStableflowRouteLogo("logo-kodiak.svg"),
  openocean: getStableflowRouteLogo("logo-openocean.svg"),
  cow: getStableflowRouteLogo("logo-cowswap.svg"),
  zerox: getStableflowRouteLogo("logo-robinhood.svg"),
  jupiter: getStableflowRouteLogo("logo-jupiter.svg"),
  titan: getStableflowRouteLogo("logo-titan.svg"),
  dflow: getStableflowRouteLogo("logo-dflow.svg"),
  hyperion: getStableflowRouteLogo("logo-hyperion.svg"),
  "near-smart": getStableflowRouteLogo("logo-rhea.svg"),
  "near-smartx": getStableflowRouteLogo("logo-rhea.svg"),
  nearintents: getStableflowRouteLogo("logo-near-intents.svg"),
  "near-intents": getStableflowRouteLogo("logo-near-intents.svg"),
  "preswap-nearintents": getStableflowRouteLogo("logo-near-intents.svg"),
  rango: getStableflowRouteLogo("logo-rango.svg"),
  lifi: getStableflowRouteLogo("logo-lifi.svg"),
  jumper: getStableflowRouteLogo("logo-jumper.svg"),
  bungee: getStableflowRouteLogo("logo-bungee.svg"),
  swapkit: getStableflowRouteLogo("logo-swapkit.svg"),
  omnibridge: getStableflowRouteLogo("logo-omni.svg"),
  stableflow: getStableflowLogo("logo-stableflow-full-2.svg"),
};

export const RouterLogoSimpleMap: Record<string, string> = {
  bitget: getStableflowRouteLogo("logo-bitget-simple.svg"),
  okx: getStableflowRouteLogo("logo-okx-simple.svg"),
  binance: getStableflowRouteLogo("logo-binance-simple.svg"),
  "1inch": getStableflowRouteLogo("logo-1inch-simple.svg"),
  paraswap: getStableflowRouteLogo("logo-velora-simple.svg"),
  kodiak: getStableflowRouteLogo("logo-kodiak-simple.svg"),
  openocean: getStableflowRouteLogo("logo-openocean-simple.svg"),
  cow: getStableflowRouteLogo("logo-cowswap-simple.svg"),
  zerox: getStableflowRouteLogo("logo-robinhood-simple.svg"),
  jupiter: getStableflowRouteLogo("logo-jupiter-simple.svg"),
  titan: getStableflowRouteLogo("logo-titan-simple.svg"),
  dflow: getStableflowRouteLogo("logo-dflow-simple.svg"),
  hyperion: getStableflowRouteLogo("logo-hyperion-simple.svg"),
  "near-smart": getStableflowRouteLogo("logo-rhea-simple.svg"),
  "near-smartx": getStableflowRouteLogo("logo-rhea-simple.svg"),
  nearintents: getStableflowRouteLogo("logo-near-intents-simple.svg"),
  "near-intents": getStableflowRouteLogo("logo-near-intents-simple.svg"),
  "preswap-nearintents": getStableflowRouteLogo("logo-near-intents-simple.svg"),
  rango: getStableflowRouteLogo("logo-rango-simple.svg"),
  lifi: getStableflowRouteLogo("logo-lifi-simple.svg"),
  jumper: getStableflowRouteLogo("logo-jumper-simple.svg"),
  bungee: getStableflowRouteLogo("logo-bungee-simple.svg"),
  swapkit: getStableflowRouteLogo("logo-swapkit-simple.svg"),
  omnibridge: getStableflowRouteLogo("logo-omni-simple.svg"),
  stableflow: getStableflowLogo("logo-stableflow.svg"),
};

/** Returns logo URL, or empty string when unconfigured / placeholder. */
export const getRouterLogo = (router?: string, simple = false): string => {
  const key = (router || "").toLowerCase();
  if (!key) return "";
  const map = simple ? RouterLogoSimpleMap : RouterLogoMap;
  return map[key] ?? "";
};

export const getRouterDisplayName = (router?: string, routerName?: string): string => {
  if (routerName) return routerName;
  if (!router) return "";
  const known: Record<string, string> = {
    bitget: "Bitget",
    okx: "OKX",
    binance: "Binance Web3",
    "1inch": "1inch",
    paraswap: "ParaSwap",
    kodiak: "Kodiak",
    openocean: "OpenOcean",
    cow: "CoW Protocol",
    zerox: "Robinhood",
    jupiter: "Jupiter",
    titan: "Titan",
    dflow: "DFlow",
    hyperion: "Hyperion",
    "near-smart": "SmartV1",
    "near-smartx": "SmartV2",
    nearintents: "Near Intents",
    "near-intents": "Near Intents",
    "preswap-nearintents": "Near Intents",
    rango: "Rango",
    lifi: "LI.FI",
    jumper: "Jumper",
    bungee: "Bungee",
    swapkit: "SwapKit",
    omnibridge: "OmniBridge",
    stableflow: "StableFlow",
  };
  return known[router.toLowerCase()] || router;
};
