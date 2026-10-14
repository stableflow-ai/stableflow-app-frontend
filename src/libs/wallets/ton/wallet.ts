import { getChainRpcUrl } from '@/config/chains';
import { Service } from '@/services/constants';
import { QuoteErrorLevel } from '@/services/quote-error';
import { Address, beginCell, Cell, internal, toNano, TonClient } from '@ton/ton';
import type { TupleItem } from '@ton/ton';
import { TonConnectUI } from '@tonconnect/ui-react';
import { SendType } from '../types';
import { bigIntToAddress, buildJettonWalletTransferBody, buildTonTransferCell, buildUlnConnnection, computeTonChannelAddress, computeTonEndpointAddress, computeTonUlnAddress, computeTonUlnConnectionAddress, objectBuild, objectDecode, pollTransactionByBoc, tonObjects, ulnConfigs } from '../utils/ton';
import { addressToBigInt, buildClass, decodeClass, parseTonAddress } from '@layerzerolabs/lz-ton-sdk-v2';
import { numberRemoveEndZero } from '@/utils/format/number';
import Big from 'big.js';
import { LZ_RECEIVE_VALUE, USDT0_LEGACY_MESH_TRANSFTER_FEE } from '@/services/usdt0/config';
import { addressToBytes32 } from '@/utils/address-validation';
import { getHopMsgFee } from '@/services/usdt0/hop-composer';
import { ethers } from 'ethers';
import { csl } from '@/utils/log';
import { getPrice } from '@/utils/format/price';
import { getDestinationAssociatedTokenAddress } from '../utils/solana';
import { BridgeDefaultWallets } from '@/config';
import { ExecTime } from '@/utils/exec-time';

export default class TonWallet {
  private tonConnectUI: TonConnectUI;
  private tonClient: TonClient;
  private account: string;

  constructor(options: { tonConnectUI: TonConnectUI; account: string; }) {
    this.tonConnectUI = options.tonConnectUI;
    this.account = options.account;

    this.tonClient = new TonClient({
      endpoint: getChainRpcUrl("Ton").rpcUrl,
      apiKey: import.meta.env.VITE_TON_RPC_API_KEY,
    });
  }

  // Check if the token is native TON
  private isNativeToken(originAsset: string): boolean {
    const lowerAsset = originAsset.toLowerCase();
    return lowerAsset === "ton" || lowerAsset === "native";
  }

  async getSenderJettonWallet(masterAddress: string, account?: string) {
    const _account = account || this.account;
    try {
      const jettonMasterAddress = Address.parse(masterAddress);
      const owner = Address.parse(_account);

      const ownerCell = beginCell().storeAddress(owner).endCell();
      const stack: TupleItem[] = [{ type: 'slice', cell: ownerCell }];

      const response = await this.tonClient.runMethod(jettonMasterAddress, "get_wallet_address", stack);

      const jettonWalletCell = response.stack.readCell();
      const jettonWalletAddress = jettonWalletCell.beginParse().loadAddress();

      return jettonWalletAddress;
    } catch (error) {
      console.error("get %s jetton wallet failed: %o", _account, error);
      throw error;
    }
  }

  async transfer(data: {
    originAsset: string;
    depositAddress: string;
    amount: string;
    memo?: string;
  }) {
    const { originAsset, depositAddress, amount, memo } = data;

    if (!this.tonConnectUI) {
      throw new Error('TON Connect UI not initialized');
    }

    try {
      if (this.isNativeToken(originAsset)) {
        // Native TON token transfer
        const transaction = {
          messages: [
            {
              address: depositAddress,
              amount: toNano(amount).toString(),
            }
          ],
          validUntil: Math.floor(Date.now() / 1000) + 600, // 10 minutes
        };

        const result = await this.tonConnectUI.sendTransaction(transaction);
        return result.boc;
      }

      const senderJettonWallet = await this.getSenderJettonWallet(originAsset);

      const body = buildJettonWalletTransferBody({
        memo,
        amount,
        recipient: depositAddress,
        refundTo: this.account,
      });

      const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [
          {
            address: senderJettonWallet.toString(), // sender jetton wallet
            amount: toNano("0.05").toString(), // for commission fees, excess will be returned
            payload: body.toBoc().toString("base64"), // payload with jetton transfer body
          },
        ],
      };

      const result = await this.tonConnectUI.sendTransaction(transaction);
      return result.boc;
    } catch (error) {
      console.log('TON transfer error:', error);
      throw error;
    }
  }

  async getBalance(token: any, account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    try {
      if (this.isNativeToken(token.symbol)) {
        const parsedAddress = Address.parse(account);
        const accountState = await this.tonClient.getBalance(parsedAddress);
        return accountState.toString();
      }
      const tokenJettonWallet = await this.getSenderJettonWallet(token.contractAddress, account);
      const response = await this.tonClient.runMethod(tokenJettonWallet, "get_wallet_data", []);
      const balance = response.stack.readBigNumber();
      return balance.toString();
    } catch (error) {
      csl("Ton getBalance", "red-500", "Get balance failed: %o", error);
      if (isCatchError) {
        throw error;
      }
      return "0";
    }
  }

  async balanceOf(token: string, account: string, options?: { isCatchError?: boolean; }) {
    return await this.getBalance(token, account, options);
  }

  async estimateTransferGas(data: {
    fromToken: any;
    depositAddress: string;
    amount: string;
    account: string;
  }): Promise<{
    gasLimit: bigint;
    gasPrice: bigint;
    estimateGas: bigint;
  }> {
    const { fromToken, amount, depositAddress, account } = data;

    let estimateGas: bigint;

    if (this.isNativeToken(fromToken.symbol)) {
      estimateGas = toNano("0.01");
    } else {
      const senderJettonWallet = await this.getSenderJettonWallet(fromToken.contractAddress, account);
      const body = buildJettonWalletTransferBody({
        amount,
        recipient: depositAddress,
        refundTo: account,
      });
      try {
        const estimation = await this.tonClient.estimateExternalMessageFee(senderJettonWallet, {
          body,
          initCode: null,
          initData: null,
          ignoreSignature: true,
        });
        const { in_fwd_fee, storage_fee, gas_fee, fwd_fee } = estimation.source_fees;
        estimateGas = BigInt(in_fwd_fee) + BigInt(storage_fee) + BigInt(gas_fee) + BigInt(fwd_fee);
        csl("TON estimateTransferGas", "blue-300", "estimateGas: %o", estimateGas);
        estimateGas = estimateGas + toNano("0.1");
      } catch {
        estimateGas = toNano("0.12");
      }
    }

    return {
      gasLimit: estimateGas,
      gasPrice: 1n, // TON has no gas price concept, use 1 for compatibility
      estimateGas,
    };
  }

  async getEstimateGas(params: any) {
    const { gasLimit, price, nativeToken } = params;

    const estimateGasAmount = Big(gasLimit.toString()).div(10 ** nativeToken.decimals);
    const estimateGasUsd = Big(estimateGasAmount).times(price || 1);

    return {
      gasPrice: 1n,
      usd: numberRemoveEndZero(Big(estimateGasUsd).toFixed(20)),
      wei: gasLimit,
      amount: numberRemoveEndZero(Big(estimateGasAmount).toFixed(nativeToken.decimals)),
    };
  }

  async estimateTransaction(params: any) {
    const {
      dry,
      body,
      estimateGas,
      fromToken,
      prices,
    } = params;

    const nativeTokenPrice = getPrice(prices, fromToken.nativeToken.symbol);

    let finalEstimateGas = estimateGas || toNano("0.12");
    if (body) {
      try {
        const account = this.account || BridgeDefaultWallets["ton"];
        const senderJettonWallet = await this.getSenderJettonWallet(fromToken.contractAddress, account);
        const estimation = await this.tonClient.estimateExternalMessageFee(senderJettonWallet, {
          body,
          initCode: null,
          initData: null,
          ignoreSignature: true,
        });
        csl("TON estimateTransaction", "blue-300", "estimation: %o", estimation);
        const { in_fwd_fee, storage_fee, gas_fee, fwd_fee } = estimation.source_fees;
        finalEstimateGas = BigInt(in_fwd_fee) + BigInt(storage_fee) + BigInt(gas_fee) + BigInt(fwd_fee);
        finalEstimateGas = finalEstimateGas + toNano("0.1");
      } catch (error) {
        csl("TON estimateTransaction", "red-500", "estimateExternalMessageFee failed: %o", error);
      }
    }

    const { usd, wei } = await this.getEstimateGas({
      gasLimit: finalEstimateGas,
      price: nativeTokenPrice,
      nativeToken: fromToken.nativeToken,
    });

    const result = {
      estimateSourceGasLimit: finalEstimateGas,
      estimateSourceGas: wei,
      estimateSourceGasUsd: usd,
    };

    return result;
  }

  async quote(type: Service, params: any) {
    switch (type) {
      case Service.Usdt0:
        return await this.quoteOFT(params);
      case Service.OneClick:
        return await this.quoteOneClickProxy(params);
      default:
        throw new Error(`Unsupported quote type: ${type}`);
    }
  }

  async send(type: SendType, params: any) {
    switch (type) {
      case SendType.SEND:
        return await this.sendTransaction(params);
      case SendType.TRANSFER:
        return await this.transfer(params);
      default:
        throw new Error(`Unsupported send type: ${type}`);
    }
  }

  async sendTransaction(params: any) {
    const {
      transaction,
    } = params;

    const result = await this.tonConnectUI.sendTransaction(transaction);
    const { hexHash } = await pollTransactionByBoc(result.boc, { maxPollCount: 60, pollInterval: 3000 });
    return hexHash;
  }

  async quoteOFT(params: any) {
    const { Options } = await import("@layerzerolabs/lz-v2-utilities");
    const {
      dry,
      originLayerzeroAddress,
      destinationLayerzeroAddress,
      fromToken,
      toToken,
      dstEid,
      refundTo,
      recipient,
      amountWei,
      payInLzToken,
      slippageTolerance,
      multiHopComposer,
      isMultiHopComposer,
      isOriginLegacy,
      isDestinationLegacy,
      prices,
      excludeFees,
      originLayerzero,
      destinationLayerzero,
    } = params;

    const _quoteType = `Usdt0 TON ${fromToken.chainName}->${toToken.chainName}`;
    const execTime = new ExecTime({ type: _quoteType, logStyle: "indigo-100" });

    const result: any = {
      needApprove: false,
      sendParam: void 0,
      fees: {},
      estimateSourceGas: void 0,
      totalEstimateSourceGas: 0n,
      estimateSourceGasUsd: void 0,
      outputAmount: numberRemoveEndZero(Big(amountWei || 0).div(10 ** fromToken.decimals).toFixed(fromToken.decimals, 0)),
      quoteParam: {
        ...params,
      },
      totalFeesUsd: void 0,
      estimateTime: 0,
    };

    // TON contract addresses (mainnet)
    const TON_ULN_MANAGER = "0x06b52b11abaf65bf1ff47c57e890ba4ad6a75a68859bbe5a51c1fc451954c54c";
    const TON_CONTROLLER = "0x1eb2bbea3d8c0d42ff7fd60f0264c866c934bbff727526ca759e7374cae0c166";

    const srcAddress = parseTonAddress("0:933ef20686fe0b3121443d6813e9457bca975336fcb481446f3c7d131517e7f8");
    csl("TON quoteOFT", "yellow-600", "srcAddress: %o", srcAddress.toString());

    const tonUlnManagerBigInt = BigInt(TON_ULN_MANAGER);
    const tonControllerBigInt = BigInt(TON_CONTROLLER);
    const proxyAddress = Address.parse(originLayerzeroAddress);

    // Gas constants
    const JETTON_TRANSFER_GAS = 0.07; // TON for the Jetton transfer hop
    const GAS_ASSERT_MULTIPLIER = 440n; // Based on contract gas asserts × safety margin

    // Cell builders/decoders for the USDT0 OFT protocol
    const oftBuild = objectBuild(tonObjects);
    const oftDecode = objectDecode(tonObjects);

    const amountLd = BigInt(amountWei);
    const slippage = slippageTolerance;
    const minAmountLd = BigInt(Big(amountWei).times(Big(1).minus(Big(slippage).div(100))).toFixed(0));

    const lzReceiveOptionGas = isDestinationLegacy ? destinationLayerzero.lzReceiveOptionGasLegacy : destinationLayerzero.lzReceiveOptionGas;
    let lzReceiveOptionValue = 0;
    execTime.breakpoint();
    const destATA = await getDestinationAssociatedTokenAddress({
      recipient,
      toToken,
    });
    execTime.log("getDestinationAssociatedTokenAddress");
    if (destATA.needCreateTokenAccount) {
      lzReceiveOptionValue = LZ_RECEIVE_VALUE[toToken.chainName] || 0;
    }

    let _dstEid: any = dstEid;
    const finalDstAddress = addressToBytes32(toToken.chainType, recipient);
    let to = finalDstAddress;
    csl("TON quoteOFT", "blue-300", "_dstEid: %o", _dstEid);
    csl("TON quoteOFT", "blue-300", "to: %o", to);

    let dstProxyAddress = addressToBytes32(toToken.chainType, destinationLayerzeroAddress);
    if (isMultiHopComposer) {
      _dstEid = multiHopComposer.eid;
      to = addressToBytes32("evm", multiHopComposer.oftMultiHopComposer);
      dstProxyAddress = addressToBytes32("evm", multiHopComposer.oftLegacy);
      csl("TON quoteOFT", "blue-300", "MultiHop _dstEid: %o", _dstEid);
      csl("TON quoteOFT", "blue-300", "MultiHop to: %o", to);
    }

    const dstProxyAddressBigInt = BigInt(dstProxyAddress);
    execTime.breakpoint();
    const jettonWalletAddress = await this.getSenderJettonWallet(fromToken.contractAddress, refundTo);
    execTime.log("getSenderJettonWallet");
    csl("TON quoteOFT", "blue-300", "jettonWalletAddress: %o", jettonWalletAddress.toString());
    csl("TON quoteOFT", "blue-300", "refundTo: %o", refundTo);
    csl("TON quoteOFT", "blue-300", "Address.parse(refundTo): %o", Address.parse(refundTo));

    // get Message fee
    const oftProxyBigInt = addressToBigInt(proxyAddress);
    csl("TON quoteOFT", "blue-300", "oftProxyBigInt: %o", oftProxyBigInt);

    const buildForwardPayload = async (
      dstAddress: string,
      nativeFee: bigint,
      minAmountOut: bigint
    ): Promise<Cell> => {
      let _composeMessage = beginCell().endCell();
      const optionsV2Params = {
        lzReceiveGas: 0n,
        lzReceiveValue: 0n,
        nativeDropAddress: BigInt(dstAddress),
        nativeDropAmount: 0n,
        lzComposeGas: 0n,
        lzComposeValue: 0n,
      };

      if (isMultiHopComposer) {
        let multiHopExtraOptions = Options.newOptions().toHex();
        if (lzReceiveOptionValue) {
          multiHopExtraOptions = Options.newOptions().addExecutorLzReceiveOption(lzReceiveOptionGas, lzReceiveOptionValue).toHex();
        }

        const composeMsgSendParam = {
          dstEid,
          to: addressToBytes32(toToken.chainType, recipient),
          amountLD: amountLd,
          minAmountLD: minAmountLd,
          extraOptions: multiHopExtraOptions,
          composeMsg: "0x",
          oftCmd: "0x",
        };
        const hopMsgFee = await getHopMsgFee({
          sendParam: composeMsgSendParam,
          toToken,
        });

        optionsV2Params.lzReceiveGas = 200000n;
        optionsV2Params.nativeDropAddress = 0n;
        optionsV2Params.lzComposeGas = originLayerzero.composeOptionGas || 800000n;
        // It's important to add 20% buffer
        // otherwise the lzcompose will fail
        optionsV2Params.lzComposeValue = hopMsgFee * 120n / 100n;

        const extraOptions = buildClass("md::OptionsV1", {
          lzReceiveGas: BigInt(lzReceiveOptionGas),
          lzReceiveValue: 0n,
          nativeDropAddress: finalDstAddress,
          nativeDropAmount: 0n,
        });
        execTime.breakpoint();
        try {
          const response = await this.tonClient
            .provider(proxyAddress)
            .get("_encodeOftSendAsComposeMessage", [
              { type: "int", value: 0n },
              { type: "int", value: BigInt(params.dstEid) },
              { type: "int", value: addressToBigInt(finalDstAddress) },
              { type: "cell", cell: extraOptions },
            ]);
          _composeMessage = response.stack.readCell();
        } catch (err) {
          csl("TON quoteOFT", "red-500", "createComposePayload failed: %o", err);
          throw "get compose message failed";
        }
        execTime.log("_encodeOftSendAsComposeMessage");
      }

      const extraOptions = buildClass("md::OptionsV2", optionsV2Params);

      return oftBuild.OFTSend({
        dstEid: BigInt(_dstEid),
        to: BigInt(dstAddress),
        minAmount: minAmountOut,
        nativeFee,
        zroFee: 0n, // ZRO token doesn't exist on TON
        extraOptions,
        composeMessage: _composeMessage,
      });
    };

    // Build a preliminary forward payload with 0 fee (fee is determined by the quote)
    execTime.breakpoint();
    const forwardPayload = await buildForwardPayload(to, 0n, minAmountLd);
    execTime.log("buildForwardPayload");
    const { composeMessage } = oftDecode.OFTSend(forwardPayload);
    csl("TON quoteOFT", "blue-300", "composeMessage: %o", composeMessage);

    // Get the LzSend metadata from the OFT contract
    execTime.breakpoint();
    const lzSendResult = await this.tonClient
      .provider(proxyAddress)
      .get("getLzSendMd", [
        { type: "cell", cell: forwardPayload },
        { type: "int", value: 2n }, // Msg type: SEND_OFT
        { type: "cell", cell: composeMessage },
      ]);
    const lzSend = decodeClass("md::LzSend", lzSendResult.stack.readCell());
    execTime.log("getLzSendMd", "lzSend: %o", lzSend);

    // Compute derived contract addresses for the ULN quote
    const ulnAddress = bigIntToAddress(
      computeTonUlnAddress("USDT", tonUlnManagerBigInt, BigInt(_dstEid))
    );
    csl("TON quoteOFT", "blue-300", "ulnAddress: %o", ulnAddress.toString());
    const endpointAddress = bigIntToAddress(
      computeTonEndpointAddress(
        "USDT",
        tonControllerBigInt,
        BigInt(_dstEid)
      )
    );
    csl("TON quoteOFT", "blue-300", "endpointAddress: %o", endpointAddress.toString());
    const channelAddress = bigIntToAddress(
      computeTonChannelAddress(
        "USDT",
        oftProxyBigInt,
        BigInt(_dstEid),
        dstProxyAddressBigInt,
        tonControllerBigInt,
        addressToBigInt(endpointAddress)
      )
    );
    csl("TON quoteOFT", "blue-300", "channelAddress: %o", channelAddress.toString());

    // Build the ULN connection initial storage (needed for the quote)
    const connectionInitialStorage = buildUlnConnnection(
      oftProxyBigInt,
      BigInt(_dstEid),
      dstProxyAddressBigInt,
      tonUlnManagerBigInt,
      addressToBigInt(ulnAddress)
    );
    csl("TON quoteOFT", "blue-300", "connectionInitialStorage: %o", connectionInitialStorage);

    // Fetch the ULN connection config for the send path
    const ulnConnectionAddress = bigIntToAddress(
      computeTonUlnConnectionAddress(
        "USDT",
        oftProxyBigInt,
        BigInt(_dstEid),
        dstProxyAddressBigInt,
        tonUlnManagerBigInt,
        addressToBigInt(ulnAddress)
      )
    );
    csl("TON quoteOFT", "blue-300", "ulnConnectionAddress: %o", ulnConnectionAddress);

    let customUlnSendConfig;
    execTime.breakpoint();
    try {
      const ulnConnectionResult = await this.tonClient
        .provider(ulnConnectionAddress)
        .get("getContractStorage", []);
      const ulnConnectionStorage = decodeClass(
        "UlnConnection",
        ulnConnectionResult.stack.readCell()
      );
      customUlnSendConfig = ulnConnectionStorage.UlnSendConfigOApp;
    } catch (error) {
      // ULN connection not yet deployed — fetch default send config from ULN itself
      // const ulnStorageResult = await this.tonClient
      //   .provider(ulnAddress)
      //   .get("getContractStorage", []);
      // const ulnStorage = decodeClass("Uln", ulnStorageResult.stack.readCell());
      // customUlnSendConfig = ulnStorage.defaultUlnSendConfig;
      customUlnSendConfig = ulnConfigs[toToken.chainName];
      csl("TON quoteOFT", "gray-500", "get UlnConnectionStorage failed, get config from ulnConfigs: %o, error: %o", customUlnSendConfig, error);
    }
    execTime.log("getContractStorage(ulnConnection)");
    csl("TON quoteOFT", "blue-300", "customUlnSendConfig: %o", customUlnSendConfig);

    // Build the full ULN send metadata
    const mdUlnSend = buildClass("md::UlnSend", {
      lzSend,
      customUlnSendConfig,
      connectionInitialStorage,
      forwardingAddress: channelAddress,
    });
    csl("TON quoteOFT", "blue-300", "mdUlnSend: %o", mdUlnSend);

    // Query the ULN for the actual fee quote
    execTime.breakpoint();
    const quoteStack = (
      await this.tonClient.provider(ulnAddress).get("ulnQuote", [
        {
          type: "cell",
          cell: mdUlnSend,
        },
      ])
    ).stack;
    execTime.log("get ulnQuote");
    csl("TON quoteOFT", "blue-300", "quoteStack: %o", quoteStack);

    const parsedArray = quoteStack.readTuple().skip(1).pop() as unknown as Cell[];
    const parsedQuote = decodeClass("md::MsglibSendCallback", parsedArray[3]);
    csl("TON quoteOFT", "blue-300", "parsedQuote: %o", parsedQuote);

    // Add 30% buffer — unused fee is refunded to the sender
    const FEE_BUFFER = 130n;
    const FEE_DIVISOR = 100n;

    const nativeFee = (parsedQuote.nativeFee * FEE_BUFFER) / FEE_DIVISOR;
    const zroFee = 0n;
    csl("TON quoteOFT", "blue-300", "nativeFee: %o", nativeFee);
    csl("TON quoteOFT", "blue-300", "zroFee: %o", zroFee);

    csl("TON quoteOFT", "blue-600", "Fee: %o TON (includes 30% buffer)", Number(nativeFee) / 1e9);
    csl("TON quoteOFT", "blue-600", "Amount received: %o USDT (min)", Number(minAmountLd) / 1e6);

    execTime.breakpoint();
    const sendForwardPayload = await buildForwardPayload(
      to,
      nativeFee,
      minAmountLd
    );
    execTime.log("buildForwardPayload(send)", "sendForwardPayload: %o", sendForwardPayload);

    execTime.breakpoint();
    const storage = await this.tonClient
      .provider(proxyAddress)
      .get("getContractStorage", []);
    execTime.log("getContractStorage(proxyAddress)");
    const cell = storage.stack.readCell();
    const oftCell = oftDecode.UsdtOFT(cell);
    const gasAsserts = oftDecode.GasAsserts(oftCell.gasAsserts);
    const estimatedGas = gasAsserts.sendOFTGas * GAS_ASSERT_MULTIPLIER;
    csl("TON quoteOFT", "blue-300", "estimatedGas: %o", estimatedGas);

    const fwdAmount = nativeFee + estimatedGas;
    csl("TON quoteOFT", "blue-300", "fwdAmount: %o", fwdAmount);
    const totalValue = fwdAmount + toNano(JETTON_TRANSFER_GAS);
    csl("TON quoteOFT", "blue-300", "totalValue: %o", totalValue);
    const transferCell = buildTonTransferCell({
      toAddress: proxyAddress,
      fromAddress: Address.parse(refundTo),
      value: totalValue,
      fwdAmount,
      jettonAmount: amountLd,
      forwardPayload: sendForwardPayload,
    });
    csl("TON quoteOFT", "blue-300", "transferCell: %o", transferCell);

    const transaction = {
      validUntil: Math.floor(Date.now() / 1000) + 360,
      messages: [
        {
          address: jettonWalletAddress.toString(),
          amount: totalValue.toString(),
          payload: transferCell.toBoc().toString("base64"),
        }
      ],
    };
    csl("TON quoteOFT", "blue-300", "transaction: %o", transaction);

    result.sendParam = {
      transaction,
      estimateGas: estimatedGas,
    };

    const nativeFeeUsd = Big(nativeFee.toString())
      .div(10 ** fromToken.nativeToken.decimals)
      .times(getPrice(prices, fromToken.nativeToken.symbol));
    result.fees.nativeFeeUsd = numberRemoveEndZero(nativeFeeUsd.toFixed(20));

    const estimateGasUsd = Big(estimatedGas.toString())
      .div(10 ** fromToken.nativeToken.decimals)
      .times(getPrice(prices, fromToken.nativeToken.symbol));
    result.fees.nativeFee = Big(nativeFee.toString())
      .div(10 ** fromToken.nativeToken.decimals)
      .toFixed(fromToken.nativeToken.decimals, 0);
    result.fees.lzTokenFee = zroFee.toString();

    execTime.breakpoint();
    const ett = await this.estimateTransaction({
      dry,
      estimateGas: estimatedGas,
      fromToken,
      prices,
    });
    execTime.log("estimateTransaction");

    result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
    result.estimateSourceGasUsd = ett.estimateSourceGasUsd;
    result.estimateSourceGas = ett.estimateSourceGas;
    result.totalEstimateSourceGas = nativeFee + ett.estimateSourceGas;

    result.fees.estimateGasUsd = numberRemoveEndZero(estimateGasUsd.toFixed(20));
    result.estimateSourceGasUsd = numberRemoveEndZero(estimateGasUsd.toFixed(20));
    result.estimateSourceGas = estimatedGas;
    result.totalEstimateSourceGas = nativeFee + estimatedGas;

    // 0.03% fee for Legacy Mesh transfers only (native USDT0 transfers are free)
    result.fees.legacyMeshFeeUsd = numberRemoveEndZero(Big(amountWei || 0).div(10 ** params.fromToken.decimals).times(USDT0_LEGACY_MESH_TRANSFTER_FEE).toFixed(params.fromToken.decimals));
    result.outputAmount = numberRemoveEndZero(Big(Big(amountWei || 0).div(10 ** params.fromToken.decimals)).minus(result.fees.legacyMeshFeeUsd || 0).toFixed(params.fromToken.decimals, 0));

    // Check if the output amount exceeds the slippage tolerance
    // If it exceeds, return an error message
    csl("TonWallet quoteOFT", "red-600", "result.outputAmount: %o", result.outputAmount);
    csl("TonWallet quoteOFT", "red-600", "slippageTolerance: %o", slippageTolerance + "%");
    csl("TonWallet quoteOFT", "red-600", "Minimum received amount: %o", Big(amountWei).div(10 ** fromToken.decimals).times(Big(1).minus(Big(slippageTolerance || 0).div(100))).toFixed(6, 0));
    if (Big(result.outputAmount).lt(Big(amountWei).div(10 ** fromToken.decimals).times(Big(1).minus(Big(slippageTolerance || 0).div(100))))) {
      result.errMsg = "Slippage limit exceeded";
      result.errLevel = QuoteErrorLevel.Business;
      return result;
    }

    for (const feeKey in result.fees) {
      if (excludeFees && excludeFees.includes(feeKey) || !/Usd$/.test(feeKey)) {
        continue;
      }
      result.totalFeesUsd = Big(result.totalFeesUsd || 0).plus(result.fees[feeKey] || 0);
    }
    result.totalFeesUsd = numberRemoveEndZero(Big(result.totalFeesUsd || 0).toFixed(20));

    execTime.logTotal("quoteOFT");

    return result;


    // const lzReceiveOptionGas = isDestinationLegacy ? destinationLayerzero.lzReceiveOptionGasLegacy : destinationLayerzero.lzReceiveOptionGas;
    // const lzReceiveOptionValue = LZ_RECEIVE_VALUE[toToken.chainName] || 0;

    // let unMultiHopExtraOptions = Options.newOptions().toBytes();
    // if (!isMultiHopComposer && lzReceiveOptionValue) {
    //   unMultiHopExtraOptions = Options.newOptions().addExecutorLzReceiveOption(lzReceiveOptionGas, lzReceiveOptionValue).toBytes();
    // }

    // let _dstEid: any = dstEid;
    // let to = addressToBytes32(toToken.chainType, recipient);

    // let extraOptions = unMultiHopExtraOptions;
    // let composeMsg = null;
    // if (isMultiHopComposer) {
    //   _dstEid = multiHopComposer.eid;
    //   to = addressToBytes32("evm", multiHopComposer.oftMultiHopComposer);

    //   let multiHopExtraOptions = Options.newOptions().toHex();
    //   if (lzReceiveOptionValue) {
    //     multiHopExtraOptions = Options.newOptions().addExecutorLzReceiveOption(lzReceiveOptionGas, lzReceiveOptionValue).toHex();
    //   }

    //   const composeMsgSendParam = {
    //     dstEid,
    //     to: addressToBytes32(toToken.chainType, recipient),
    //     amountLD: amountLd,
    //     minAmountLD: minAmountLd,
    //     extraOptions: multiHopExtraOptions,
    //     composeMsg: "0x",
    //     oftCmd: "0x",
    //   };
    //   const hopMsgFee = await getHopMsgFee({
    //     sendParam: composeMsgSendParam,
    //     toToken,
    //   });

    //   extraOptions = Options.newOptions()
    //     .addExecutorComposeOption(0, originLayerzero.composeOptionGas || 500000, hopMsgFee)
    //     .toBytes();

    //   const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    //   const composeEncoder = abiCoder.encode(
    //     ["tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd)"],
    //     [Object.values(composeMsgSendParam)]);

    //   composeMsg = ethers.getBytes(composeEncoder);
    // }

    // const parsedAddress = Address.parse(originLayerzeroAddress);
    // const contractStorage = await this.tonClient.runMethod(parsedAddress, "getContractStorage", []);

    // _log("contractStorage: %o", contractStorage);
    // const contractStorageReader = contractStorage.stack;
    // const contractStorageReaderCell = contractStorage.stack.readCell();

    // _log("contractStorageReader: %o", contractStorageReader);
    // _log("contractStorageReaderCell: %o", contractStorageReaderCell);

    // const adminAddress = contractStorageReader.readAddress();

    // _log("adminAddress: %o", adminAddress);

    // const usdtOftDecoder = generateDecodeClass(tonObjects);
    // _log("usdtOftDecoder: %o", usdtOftDecoder);
    // const usdtOFT = usdtOftDecoder('UsdtOFT', contractStorageReaderCell);

    // _log("usdtOFT: %o", usdtOFT);

    // const oftSend = await oftBuildClass('OFTSend', {
    //   dstEid: BigInt(_dstEid),
    //   to: BigInt(to),
    //   minAmount: minAmountLd,
    //   nativeFee: toNano("1.5"),
    //   zroFee: 0n,
    //   extraOptions: extraOptions,
    //   composeMessage,
    // });

    return { errMsg: "Not supported yet", errLevel: QuoteErrorLevel.Business };
  }

  async quoteOneClickProxy(params: any) {
    const {
      dry,
      proxyAddress,
      fromToken,
      refundTo,
      depositAddress,
      amountWei,
      prices,
    } = params;

    const execTime = new ExecTime({ type: "OneClick TON", logStyle: "indigo-200" });

    const result: any = { fees: {} };

    const forwardTonAmount = toNano("0.085");
    const buffer = toNano("0.01");

    execTime.breakpoint();
    const userJettonWallet = await this.getSenderJettonWallet(fromToken.contractAddress, refundTo);
    execTime.log("getSenderJettonWallet");
    csl("TON quoteOneClickProxy", "blue-300", "userJettonWallet: %o", userJettonWallet);

    const forwardPayload = beginCell().storeAddress(Address.parse(depositAddress)).endCell();
    const body = buildJettonWalletTransferBody({
      amount: amountWei,
      recipient: proxyAddress,
      refundTo: refundTo,
      forwardTonAmount: forwardTonAmount,
      forwardPayload,
    });
    csl("TON quoteOneClickProxy", "blue-300", "body: %o", body);

    execTime.breakpoint();
    const ett = await this.estimateTransaction({
      dry,
      body,
      fromToken,
      prices,
    });
    execTime.log("estimateTransaction");
    const totalValue = forwardTonAmount + buffer + ett.estimateSourceGas;
    csl("TON quoteOneClickProxy", "blue-300", "totalValue: %o", totalValue);

    const transaction = {
      validUntil: Math.floor(Date.now() / 1000) + 360,
      messages: [
        {
          address: userJettonWallet.toString(),
          amount: totalValue.toString(),
          payload: body.toBoc().toString("base64"),
        },
      ],
    };
    csl("TON quoteOneClickProxy", "blue-300", "transaction: %o", transaction);

    result.sendParam = {
      transaction,
      body: body,
    };

    result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
    result.estimateSourceGas = ett.estimateSourceGas;
    result.totalEstimateSourceGas = ett.estimateSourceGas;
    result.estimateSourceGasUsd = ett.estimateSourceGasUsd;

    execTime.logTotal("quoteOneClickProxy");

    return result;
  }
}
