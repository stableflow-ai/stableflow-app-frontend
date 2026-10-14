import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import CheckIcon from "./check-icon";
import useWalletStore from "@/stores/use-wallet";
import Address from "./address";
import TipInfo from "@/components/tip-info";
import clsx from "clsx";

const LABEL = {
  evm: "EVM chains",
  sol: "Solana",
  near: "Near",
  tron: "Tron",
  aptos: "Aptos",
  ton: "Ton",
  sui: "Sui",
  btc: "Bitcoin",
  zcash: "Zcash",
};

export default function TypeItem({ type = "evm", token, isDisabled, isConnectDisabled }: { type: WalletType; token: any; isDisabled?: boolean; isConnectDisabled?: boolean; }) {
  const wallets = useWalletsStore();
  const wallet = wallets[type || "evm"];
  const walletStore = useWalletStore();
  const connectDisabled = isDisabled || isConnectDisabled;

  return (
    <div
      className={clsx(
        "pl-[10px] pr-[4px] py-[6px] flex justify-between items-center",
        isDisabled ? "" : "button",
      )}
      onClick={() => {
        if (type === "evm" || !token || isDisabled) {
          return;
        }

        if (walletStore.isTo) {
          if (token.contractAddress === walletStore.fromToken?.contractAddress) {
            walletStore.set({
              toToken: token,
              fromToken: null,
              showWallet: false,
            });
            return;
          }
        } else {
          if (token.contractAddress === walletStore.toToken?.contractAddress) {
            walletStore.set({
              fromToken: token,
              toToken: null,
              showWallet: false,
            });
            return;
          }
        }

        walletStore.set({
          [walletStore.isTo ? "toToken" : "fromToken"]: token,
          showWallet: false
        });
      }}
    >
      <div className="flex items-center gap-[10px]">
        {token?.chainIcon && (
          <img
            src={token?.chainIcon}
            alt={token?.chainName}
            className="w-[24px] h-[24px]"
          />
        )}

        <span className="text-[15px] font-[500] flex items-center gap-[5px] whitespace-nowrap">
          <span className="flex items-center gap-1">
            <span className="">{LABEL[type]}</span>
            {
              type === "evm" && (
                <TipInfo>
                  Ethereum and other EVM-compatible networks
                </TipInfo>
              )
            }
          </span>
          {
            (walletStore.fromToken?.chainType === type || walletStore.toToken?.chainType === type)
              ? (
                <CheckIcon circleColor="#fff" />
              )
              : null
          }
        </span>
      </div>
      {wallet.account ? (
        <Address type={type} />
      ) : (
        <button
          className={clsx(
            "duration-300 h-[32px] rounded-[16px] bg-white shadow-[0_2px_6px_0_rgba(0,0,0,0.10)] text-[14px] text-[#444C59]",
            connectDisabled ? "cursor-not-allowed w-[120px]" : "cursor-pointer w-[90px] hover:bg-[#6284F5] hover:text-white",
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (connectDisabled) {
              return;
            }
            wallet.connect();
          }}
        >
          {connectDisabled ? "Not supported" : "Connect"}
        </button>
      )}
    </div>
  );
}
