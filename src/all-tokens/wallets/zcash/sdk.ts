import { NoirZcashWalletAdapter } from "@rhea-finance/zcash-wallet-adapter";

export const zcashWalletAdapter = new NoirZcashWalletAdapter({
  network: "mainnet",
});

export function isNoirWalletInstalled() {
  if (typeof window === "undefined") return false;
  const injected = (window as Window & { noirwallet?: { zcash?: unknown } }).noirwallet;
  return Boolean(injected?.zcash);
}

export function connectedZcashAddress() {
  return zcashWalletAdapter.shieldedAddress || zcashWalletAdapter.transparentAddress || null;
}

export async function connect_zcash() {
  return await zcashWalletAdapter.connect();
}

export async function get_accounts_zcash() {
  return await zcashWalletAdapter.getAccounts();
}

export async function get_balance_zcash() {
  return await zcashWalletAdapter.getBalance();
}

export async function sign_message_zcash(message: string) {
  const result = await zcashWalletAdapter.signMessage(message);
  return {
    ...result,
    pubkey: result.publicKey,
  };
}

export async function transfer_zcash({
  to,
  amount,
}: {
  to: string;
  amount: string;
}) {
  return await zcashWalletAdapter.signAndSendTransaction({
    to,
    amount,
    fundingSource: "shielded",
  });
}

export async function disconnect_zcash() {
  try {
    await zcashWalletAdapter.disconnect();
  } catch {
    // ignore disconnect errors when the extension is unavailable
  }
}
