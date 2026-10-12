import { PROXY_RPC_DOMAIN } from "@/config/api";
import { getChainRpcUrl } from "@/config/chains";
import { generateRpcSignature } from "@/libs/signature";
import { TronWeb } from "tronweb";

type AxiosLikeProvider = {
  instance?: {
    interceptors: {
      request: {
        use: (onFulfilled: (config: {
          headers?: {
            set?: (name: string, value: string) => void;
          } & Record<string, unknown>;
        }) => unknown) => void;
      };
    };
  };
};

const attachSignatureInterceptor = (provider?: AxiosLikeProvider) => {
  provider?.instance?.interceptors.request.use((config) => {
    const { headers } = generateRpcSignature("tron");
    if (typeof config.headers?.set === "function") {
      config.headers.set("x-hmac-signature", headers["x-hmac-signature"]);
      config.headers.set("x-timestamp", headers["x-timestamp"]);
      return config;
    }

    config.headers = {
      ...(config.headers as Record<string, string> | undefined),
      ...headers,
    };
    return config;
  });
};

/**
 * TronWeb stores RPC headers on the axios instance. setHeader() rebuilds that
 * instance, so a signature captured there expires. An interceptor signs each
 * request and must be attached after construction, never followed by setHeader.
 */
export const createSignedTronWeb = () => {
  const fullHost = getChainRpcUrl("Tron").rpcUrl;
  const tronWeb = new TronWeb({
    fullHost,
    privateKey: "",
  });

  if (fullHost.includes(PROXY_RPC_DOMAIN)) {
    // HttpProvider.instance is an axios client at runtime, but tronweb's types omit interceptors.
    attachSignatureInterceptor(tronWeb.fullNode as unknown as AxiosLikeProvider);
    attachSignatureInterceptor(tronWeb.solidityNode as unknown as AxiosLikeProvider);
    attachSignatureInterceptor(tronWeb.eventServer as unknown as AxiosLikeProvider);
  }

  return tronWeb;
};
