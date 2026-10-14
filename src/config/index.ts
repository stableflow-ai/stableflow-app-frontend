import type { WalletType } from "@/stores/use-wallets";

// Used to call the quota api when the wallet is not connected
export const BridgeDefaultWallets: Record<WalletType, string> = {
  near: "stableflow.near",
  sol: "2bRTgL16xgu6VkSRY7TJcLRuT93T1pLtaYeChhyhfFcX",
  evm: "0x10b06e6A12E86f8C2b55B5073fA3dB39b120C7F5",
  tron: "TSKMAaJLnWAUa6cKtTTm5oathCQPPaJZtF",
  aptos: "0x93493b07d031c4f18ad1e874575761be7e47d4cea5c81d538600e8ec72d6ab1c",
  ton: "UQBv1hzUIB5liMe1cqxUAvfO2tWMnN6wDyXP4DFSptAbePVK",
  sui: "0xeae6dbc896a8a6994c093bf8ea47116063f0b016f1fdc61bff95ba9dfb36c4d2",
  btc: "bc1qmxg8sxaz22dxnw3p5rz9aq4uc2vcrqxgpjkfec",
  zcash: "t1aDV9wRNwVrVJVSoUCUrFpcYSTbcKrc1Dj",
};

export const PRICE_IMPACT_THRESHOLD = 0.02; // 2%
