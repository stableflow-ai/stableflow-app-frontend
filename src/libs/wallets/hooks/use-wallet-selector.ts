import { useState } from "react";

function connectionKey(wallet: unknown): string | null {
  if (typeof wallet === "string") return wallet;
  if (!wallet || typeof wallet !== "object") return null;
  const record = wallet as { key?: unknown; name?: unknown };
  const key = record.key ?? record.name;
  if (typeof key === "string") return key;
  if (key == null) return null;
  return String(key);
}

export function useWalletSelector(props: {
  connect?: (wallet: any) => unknown;
}) {
  const { connect } = props;

  const [open, setOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const onConnect = async (wallet: any) => {
    try {
      setIsConnecting(connectionKey(wallet));
      await connect?.(wallet);
      onClose();
    } catch (error) {
      console.error(`Failed to connect to %o: %o`, wallet, error);
    } finally {
      setIsConnecting(null);
    }
  };
  const onClose = () => {
    setOpen(false);
  };
  const onOpen = () => {
    setOpen(true);
  };

  return {
    open,
    onClose,
    onOpen,
    onConnect,
    isConnecting,
  };
}
