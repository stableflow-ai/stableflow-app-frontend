import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { getChainRpcUrl } from "@/config/chains";

export const SUI_DAPP_KIT_STORAGE_KEY = "stableflow.ai_sui_dapp_kit";

export const suiDAppKit = createDAppKit({
  networks: ["mainnet"],
  defaultNetwork: "mainnet",
  createClient: (network) =>
    new SuiGrpcClient({
      network,
      baseUrl: getChainRpcUrl("Sui").rpcUrl ?? getJsonRpcFullnodeUrl("mainnet"),
    }),
  // The kit's autoConnect retries forever when the saved address is missing
  // from the wallet, and each silent connect makes OKX emit a wallet change.
  // Restore the session once from the provider instead.
  autoConnect: false,
  enableBurnerWallet: false,
  walletInitializers: [],
  slushWalletConfig: null,
  storage: typeof window !== "undefined" ? localStorage : undefined,
  storageKey: SUI_DAPP_KIT_STORAGE_KEY,
});

declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof suiDAppKit;
  }
}
