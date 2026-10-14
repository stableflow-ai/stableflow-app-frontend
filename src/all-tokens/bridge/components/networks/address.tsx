import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import Destination from "./destination";

export default function Address({ token, isTo, addressValidation }: any) {
  if (!token?.chainType)
    return <div className="w-[38px] h-[12px] rounded-[6px] bg-[#EDF0F7]" />;
  return (
    <WithChain
      token={token}
      isTo={isTo}
      addressValidation={addressValidation}
    />
  );
}

const WithChain = ({ token, isTo, addressValidation }: any) => {
  const wallet = useWalletsStore()[token.chainType as WalletType];

  if (!wallet.account && !isTo)
    return (
      <div
        className="text-[12px] text-[#0E3616] button"
        onClick={() => {
          wallet.connect();
        }}
      >
        Connect {token.chainName} wallet
      </div>
    );
  return (
    <Destination
      token={token}
      isTo={isTo}
      addressValidation={addressValidation}
    />
  );
};
