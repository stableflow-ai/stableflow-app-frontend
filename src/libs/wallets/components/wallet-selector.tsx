import { WalletSelectDialog, type WalletSelectOption } from "@stableflow/pay-widgets/wallet-select";

export type WalletSelectorItem = {
  key: string;
  name: string;
  icon?: string | null;
  url?: string;
  detected?: boolean;
};

type WalletSelectorProps = {
  open: boolean;
  onClose: () => void;
  wallets?: WalletSelectorItem[];
  title?: string;
  isConnecting?: string | null;
  onConnect?: (key: string) => void;
};

const WalletSelector = ({
  open,
  onClose,
  wallets = [],
  title,
  isConnecting = null,
  onConnect,
}: WalletSelectorProps) => {
  const options: WalletSelectOption[] = wallets.map((wallet) => {
    const installUrl = wallet.detected === false && typeof wallet.url === "string"
      ? wallet.url.trim()
      : "";
    return {
      id: wallet.key,
      name: wallet.name,
      icon: wallet.icon,
      description: wallet.name,
      detected: wallet.detected,
      installUrl: installUrl || undefined,
    };
  });

  return (
    <WalletSelectDialog
      open={open}
      onClose={onClose}
      title={title}
      wallets={options}
      connectingId={isConnecting}
      elevated
      onSelect={(option) => {
        onClose?.();
        onConnect?.(option.id);
      }}
    />
  );
};

export default WalletSelector;
