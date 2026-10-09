import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  SendTransactionError,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  ComputeBudgetProgram,
  TransactionMessage,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { getChainRpcUrl } from "@/config/chains";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import Big from "big.js";
import { numberRemoveEndZero } from "@/utils/format/number";
import { getPrice } from "@/utils/format/price";
import stableflowProxyIdl from "@/services/oneclick/stableflow-proxy.json";
import { quoteSignature } from "../utils/cctp";
import { SendType } from "../types";
import { Service, ServiceBackend } from "@/services/constants";
import { QuoteErrorLevel } from "@/services/quote-error";
import { deriveEventAuthority, deriveOftPdas, derivePeerPda, encodeQuoteSend, encodeSend, getPeerAddress, NATIVE_MSG_FEE_BUFFER } from "../utils/layerzero";
import { buildVersionedTransaction, SendHelper } from "@layerzerolabs/lz-solana-sdk-v2";
import { LZ_RECEIVE_VALUE, USDT0_LEGACY_MESH_TRANSFTER_FEE } from "@/services/usdt0/config";
import { ethers, getBytes } from "ethers";
import { getHopMsgFee } from "@/services/usdt0/hop-composer";
import { csl } from "@/utils/log";
import { publicKey } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  safeFetchToken,
  findAssociatedTokenPda,
  mplToolbox,
} from "@metaplex-foundation/mpl-toolbox";
import { oft } from "@layerzerolabs/oft-v2-solana-sdk";
import { fromWeb3JsPublicKey, toWeb3JsInstruction } from "@metaplex-foundation/umi-web3js-adapters";
import { addressToBytes32 } from "@/utils/address-validation";
import { createSolanaFallbackConnection, getActiveSolanaConnection, getAvailableSolanaRpcUrl } from "../utils/solana";
import {
  buildComputeBudgetIxs,
  fetchLookupTableAccounts,
  getAssociatedTokenAccountRent,
  getRpcEndpointHost,
  resolveNewAccountRentLamports,
  startRebroadcast,
  type ComputeBudgetResult,
} from "../utils/solana-tx";
import { type SolanaBroadcastContext } from "@/stores/use-solana-broadcast-report";
import { removeOftDust } from "../utils/oft";
import { ExecTime } from "@/utils/exec-time";

/** Only used when the compute unit simulation is unavailable. */
const SOL_TRANSFER_FALLBACK_UNITS = 50_000;
const TOKEN_TRANSFER_FALLBACK_UNITS = 100_000;
const CREATE_ATA_FALLBACK_UNITS = 50_000;
const OFT_SEND_FALLBACK_UNITS = 400_000;
const FRAX_ZERO_FALLBACK_UNITS = 600_000;
const ONECLICK_PROXY_FALLBACK_UNITS = 200_000;

export default class SolanaWallet {
  private publicKey: PublicKey | null;
  private signTransaction: any;
  private signer: any;
  private connection: Connection | null = null;

  constructor(options: { publicKey: PublicKey | null; signer: any }) {
    this.publicKey = options.publicKey;
    this.signTransaction = options.signer.signTransaction;
    this.signer = options.signer;
  }

  getConnection() {
    if (!this.connection) {
      const solanaRpcUrls: string[] = getChainRpcUrl("Solana").rpcUrls;
      this.connection = createSolanaFallbackConnection(solanaRpcUrls);
    }
    return this.connection;
  };

  /** Travels with sendParam so the broadcast telemetry knows which route and fee produced the hash. */
  private buildBroadcastMeta(params: {
    route: string;
    fromTokenSymbol?: string;
    computeBudget?: ComputeBudgetResult;
  }): SolanaBroadcastContext {
    const { route, fromTokenSymbol, computeBudget } = params;
    return {
      route,
      fromTokenSymbol,
      computeUnitLimit: computeBudget?.unitLimit,
      computeUnitPriceMicroLamports: computeBudget?.microLamports,
      priorityFeeLamports: computeBudget?.priorityFeeLamports,
      feeSource: computeBudget?.feeSource,
      unitsConsumed: computeBudget?.unitsConsumed,
    };
  }

  /**
   * Broadcast once and hand the signature back immediately, letting a background loop keep
   * re-sending it. Nothing here waits for the transaction to land.
   */
  private async broadcastAndRebroadcast(params: {
    connection: Connection;
    signedTransaction: any;
    lastValidBlockHeight?: number;
    report?: SolanaBroadcastContext;
  }) {
    const { connection, signedTransaction, lastValidBlockHeight, report } = params;

    const rawTransaction = signedTransaction.serialize();
    const signature = await connection.sendRawTransaction(rawTransaction, { skipPreflight: false });

    startRebroadcast({
      connection,
      rawTransaction,
      signature,
      lastValidBlockHeight,
      report,
    });

    return signature;
  }

  // Transfer SOL
  async transferSOL(to: string, amount: string) {
    if (!this.publicKey) {
      throw new Error("Wallet not connected");
    }

    const fromPubkey = this.publicKey;
    const toPubkey = new PublicKey(to);
    const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports
      })
    );

    const connection = this.getConnection();

    const computeBudget = await buildComputeBudgetIxs({
      connection,
      payer: fromPubkey,
      instructions: transaction.instructions,
      fallbackUnits: SOL_TRANSFER_FALLBACK_UNITS,
    });
    transaction.instructions.unshift(...computeBudget.ixs);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    // Pin the endpoint that just issued the blockhash for the send and the rebroadcast.
    const sendConnection = getActiveSolanaConnection(connection);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    const signedTransaction = await this.signTransaction(transaction);

    return await this.broadcastAndRebroadcast({
      connection: sendConnection,
      signedTransaction,
      lastValidBlockHeight,
      report: {
        route: "solana_transfer",
        address: fromPubkey.toBase58(),
        fromTokenSymbol: "SOL",
        computeUnitLimit: computeBudget.unitLimit,
        computeUnitPriceMicroLamports: computeBudget.microLamports,
        priorityFeeLamports: computeBudget.priorityFeeLamports,
        feeSource: computeBudget.feeSource,
        unitsConsumed: computeBudget.unitsConsumed,
        rpcEndpoint: getRpcEndpointHost(sendConnection),
      },
    });
  }

  // Transfer SPL token
  async transferToken(tokenMint: string, to: string, amount: string) {
    if (!this.publicKey) {
      throw new Error("Wallet not connected");
    }

    const connection = this.getConnection();

    const fromPubkey = this.publicKey;
    const toPubkey = new PublicKey(to);
    const mint = new PublicKey(tokenMint);

    // Get associated token account addresses
    const fromTokenAccount = getAssociatedTokenAddressSync(mint, fromPubkey);
    const toTokenAccount = getAssociatedTokenAddressSync(mint, toPubkey);

    const transaction = new Transaction();

    // Check if recipient has token account, create if not
    try {
      await getAccount(connection, toTokenAccount);
    } catch (error) {
      // If token account doesn't exist, create it
      transaction.add(
        createAssociatedTokenAccountInstruction(
          fromPubkey, // payer
          toTokenAccount, // ata
          toPubkey, // owner
          mint // mint
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        fromPubkey,
        BigInt(amount),
        [],
        TOKEN_PROGRAM_ID
      )
    );

    const computeBudget = await buildComputeBudgetIxs({
      connection,
      payer: fromPubkey,
      instructions: transaction.instructions,
      fallbackUnits: TOKEN_TRANSFER_FALLBACK_UNITS,
    });
    transaction.instructions.unshift(...computeBudget.ixs);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    // Pin the endpoint that just issued the blockhash for the send and the rebroadcast.
    const sendConnection = getActiveSolanaConnection(connection);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    const signedTransaction = await this.signTransaction(transaction);

    return await this.broadcastAndRebroadcast({
      connection: sendConnection,
      signedTransaction,
      lastValidBlockHeight,
      report: {
        route: "solana_transfer",
        address: fromPubkey.toBase58(),
        fromTokenSymbol: tokenMint,
        computeUnitLimit: computeBudget.unitLimit,
        computeUnitPriceMicroLamports: computeBudget.microLamports,
        priorityFeeLamports: computeBudget.priorityFeeLamports,
        feeSource: computeBudget.feeSource,
        unitsConsumed: computeBudget.unitsConsumed,
        rpcEndpoint: getRpcEndpointHost(sendConnection),
      },
    });
  }

  // Generic transfer method
  async transfer(data: {
    originAsset: string;
    depositAddress: string;
    amount: string;
  }) {
    const { originAsset, depositAddress, amount } = data;

    // Transfer SOL
    if (originAsset === "SOL" || originAsset === "sol") {
      return await this.transferSOL(depositAddress, amount);
    }

    // Transfer SPL token
    const result = await this.transferToken(
      originAsset,
      depositAddress,
      amount
    );
    return result;
  }

  async getSOLBalance(account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    const connection = this.getConnection();

    try {
      const publicKey = new PublicKey(account);
      const balance = await connection.getBalance(publicKey);
      return balance;
    } catch (error) {
      csl("Solana getSOLBalance", "red-500", "Get SOL balance failed: %o", error);
      if (isCatchError) {
        throw error;
      }
      return "0";
    }
  }

  async getTokenBalance(tokenMint: string, account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    const connection = this.getConnection();

    const mint = new PublicKey(tokenMint);
    const owner = new PublicKey(account);

    try {
      const tokenAccount = await getAssociatedTokenAddress(mint, owner);

      const accountInfo = await getAccount(connection, tokenAccount);

      return accountInfo.amount;
    } catch (error: any) {
      if (error.message.includes("could not find account")) {
        return "0";
      }
      if (isCatchError) {
        throw error;
      }
      return "0";
    }
  }

  async getBalance(token: any, account: string, options?: { isCatchError?: boolean; }) {
    if (
      token.symbol === "SOL" ||
      token.symbol === "sol" ||
      token.symbol === "native"
    ) {
      return await this.getSOLBalance(account, options);
    }
    return await this.getTokenBalance(token.contractAddress, account, options);
  }

  async balanceOf(token: any, account: string, options?: { isCatchError?: boolean; }) {
    return await this.getBalance(token, account, options);
  }

  /**
   * Estimate gas limit for transfer transaction
   * @param data Transfer data
   * @returns Gas limit estimate, gas price, and estimated gas cost
   */
  async estimateTransferGas(data: {
    fromToken: any;
    depositAddress: string;
    amount: string;
  }): Promise<{
    gasLimit: bigint;
    gasPrice: bigint;
    estimateGas: bigint;
  }> {
    const connection = this.getConnection();

    // Solana transaction fees are typically fixed at 5000 lamports per signature
    // Base fee per signature: 5000 lamports
    let estimatedFee = 5000n;

    const { fromToken, depositAddress } = data;
    const originAsset = fromToken.contractAddress;

    // Check if token account creation is needed for SPL tokens
    if (originAsset !== "SOL" && originAsset !== "sol") {
      const mint = new PublicKey(originAsset);
      const toPubkey = new PublicKey(depositAddress);
      const toTokenAccount = getAssociatedTokenAddressSync(mint, toPubkey);

      // Check if recipient has token account
      try {
        await getAccount(connection, toTokenAccount);
        // Account exists, no additional fee
      } catch (error) {
        // Account doesn't exist. Creating it costs a rent-exempt deposit, not another signature fee.
        estimatedFee += BigInt(await getAssociatedTokenAccountRent(connection));
      }
    }

    return {
      gasLimit: estimatedFee,
      gasPrice: 1n,
      estimateGas: estimatedFee
    };
  }

  async getEstimateGas(params: any) {
    const { gasLimit = "5000", price, nativeToken } = params;

    const estimateGas = BigInt(gasLimit);
    const estimateGasAmount = Big(estimateGas.toString()).div(10 ** nativeToken.decimals);
    const estimateGasUsd = Big(estimateGasAmount).times(price || 1);

    return {
      gasPrice: 1n,
      usd: numberRemoveEndZero(Big(estimateGasUsd).toFixed(20)),
      wei: estimateGas,
      amount: numberRemoveEndZero(Big(estimateGasAmount).toFixed(nativeToken.decimals)),
    };
  }

  async estimateTransaction(params: any) {
    const {
      dry,
      versionedTx,
      fromToken,
      prices,
      priorityFeeLamports = 0,
      fallbackRentLamports = 0,
    } = params;

    const nativeTokenPrice = getPrice(prices, fromToken.nativeToken.symbol);

    // Network fee only: the base fee per signature plus the priority fee.
    // Rent for accounts the transaction creates is a separate cost, reported on its own below.
    const signatureCount = BigInt(versionedTx?.message?.header?.numRequiredSignatures || 1);
    const estimatedFee = 5000n * signatureCount + BigInt(priorityFeeLamports || 0);

    let accountRentLamports = 0n;
    if (!dry && versionedTx) {
      const { usable, rentLamports, simulationError } = await resolveNewAccountRentLamports({
        connection: this.getConnection(),
        versionedTx,
      });
      if (usable) {
        accountRentLamports = BigInt(rentLamports);
      } else {
        // Simulation failing during a quote is common (insufficient funds, stale state).
        // The caller knows which accounts its own instructions create, so trust its number.
        csl("Solana estimateTransaction", "yellow-400", "simulation unusable, fallback rent: %o, err: %o", fallbackRentLamports, simulationError);
        accountRentLamports = BigInt(fallbackRentLamports || 0);
      }
    }

    const result = {
      estimateSourceGasLimit: estimatedFee,
      estimateSourceGas: 0n as bigint,
      estimateSourceGasUsd: "0",
      accountRentLamports,
      accountRentUsd: "0",
    };

    const { usd, wei } = await this.getEstimateGas({
      gasLimit: estimatedFee,
      price: nativeTokenPrice,
      nativeToken: fromToken.nativeToken,
    });
    result.estimateSourceGas = wei;
    result.estimateSourceGasUsd = usd;

    if (accountRentLamports > 0n) {
      const rent = await this.getEstimateGas({
        gasLimit: accountRentLamports,
        price: nativeTokenPrice,
        nativeToken: fromToken.nativeToken,
      });
      result.accountRentUsd = rent.usd;
      csl("Solana estimateTransaction", "purple-400", "account rent: %o lamports (%s)", accountRentLamports, rent.usd);
    }

    return result;
  }

  async checkTransactionStatus(signature: string) {
    const connection = this.getConnection();

    const maxAttempts = 30;
    const interval = 4000;
    let timer: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const tx = await connection.getTransaction(signature, {
          commitment: "finalized",
          maxSupportedTransactionVersion: 0
        });

        if (tx) {
          if (tx.meta && tx.meta.err === null) {
            return true;
          } else {
            return false;
          }
        } else {
          csl("Solana checkTransactionStatus", "purple-400", "polling attempt %d/%d: transaction not confirmed...", attempt, maxAttempts);
        }
      } catch (error: any) {
        csl("Solana checkTransactionStatus", "red-500", "checkTransactionStatus failed: %o", error.message);
      }

      await new Promise((resolve) => {
        timer = setTimeout(() => {
          clearTimeout(timer);
          resolve(true);
        }, interval);
      });
    }

    csl("Solana checkTransactionStatus", "red-500", "checkTransactionStatus failed: timeout");
    return false;
  }

  async simulateIx(ix: any) {
    const connection = this.getConnection();

    const tx = new Transaction().add(ix);

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.publicKey!;

    // Convert Transaction to VersionedTransaction to use config options
    const message = tx.compileMessage();
    const versionedTx = new VersionedTransaction(message);

    const sim = await connection.simulateTransaction(versionedTx, {
      // commitment: "confirmed",
      sigVerify: false
    });

    if (sim.value.err) console.error("Error:", sim.value.err);

    csl("Solana simulateIx", "purple-400", "sim: %o", sim);

    return sim.value;
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
      hopQuote,
    } = params;

    const connection = this.getConnection();

    try {
      const amountLdClean = removeOftDust(amountWei || 0, fromToken.decimals);
      const result: any = {
        needApprove: false,
        sendParam: void 0,
        fees: {},
        estimateSourceGas: 0n,
        totalEstimateSourceGas: 0n,
        estimateSourceGasUsd: "0",
        outputAmount: numberRemoveEndZero(Big(amountLdClean || 0).div(10 ** fromToken.decimals).toFixed(fromToken.decimals, 0)),
        quoteParam: {
          ...params,
        },
        totalFeesUsd: "0",
        estimateTime: 0,
      };

      if (BigInt(amountLdClean) === 0n) {
        result.errMsg = "Amount below minimum cross-chain unit";
        result.errLevel = QuoteErrorLevel.Business;
        return result;
      }

      const execTime = new ExecTime({ type: "USDT0 Solana", logStyle: "fuchsia-100" });

      const programId = new PublicKey(originLayerzeroAddress);
      const tokenMint = new PublicKey(fromToken.contractAddress);
      const quotePayer = new PublicKey("9JXR51yBLBgfesHF8SJgKWkNnx4FxtJCxCc3AV31TBsn");
      const lookupTable = new PublicKey("6zcTrmdkiQp6dZHYUxVr6A2XVDSYi44X1rcPtvwNcrXi");
      const tokenEscrow = new PublicKey("F1YkdxaiLA1eJt12y3uMAQef48Td3zdJfYhzjphma8hG");
      const sender = this.publicKey!;
      const userPubkey = new PublicKey(refundTo || sender.toString());

      execTime.breakpoint();
      const mintInfo = await connection.getParsedAccountInfo(tokenMint);
      execTime.log("getParsedAccountInfo");
      const decimals = (mintInfo.value?.data as { parsed: { info: { decimals: number } } }).parsed.info
        .decimals;
      const amountLd = BigInt(amountLdClean);
      const minAmountLd = BigInt(Big(amountLdClean).times(Big(1).minus(Big(slippageTolerance || 0).div(100))).toFixed(0));

      const lzReceiveOptionGas = isDestinationLegacy ? destinationLayerzero.lzReceiveOptionGasLegacy : destinationLayerzero.lzReceiveOptionGas;
      const lzReceiveOptionValue = LZ_RECEIVE_VALUE[toToken.chainName] || 0;

      let unMultiHopExtraOptions = Options.newOptions().toBytes() as Uint8Array<any>;
      if (!isMultiHopComposer && lzReceiveOptionValue) {
        unMultiHopExtraOptions = Options.newOptions().addExecutorLzReceiveOption(lzReceiveOptionGas, lzReceiveOptionValue).toBytes() as Uint8Array<any>;
      }

      let _dstEid: any = dstEid;
      let to = getBytes(addressToBytes32(toToken.chainType, recipient));

      let extraOptions = unMultiHopExtraOptions;
      let composeMsg = null;
      if (isMultiHopComposer) {
        _dstEid = multiHopComposer.eid;
        to = getBytes(addressToBytes32("evm", multiHopComposer.oftMultiHopComposer));

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
        execTime.breakpoint();
        const hopMsgFee = await getHopMsgFee({
          sendParam: composeMsgSendParam,
          toToken,
          hopQuote,
        });
        execTime.log("getHopMsgFee");

        extraOptions = Options.newOptions()
          .addExecutorComposeOption(0, originLayerzero.composeOptionGas || 500000, hopMsgFee)
          .toBytes() as Uint8Array<any>;

        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const composeEncoder = abiCoder.encode(
          ["tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd)"],
          [Object.values(composeMsgSendParam)]);

        composeMsg = ethers.getBytes(composeEncoder);
      }

      execTime.breakpoint();
      const pdas = deriveOftPdas(programId, _dstEid);
      const peerAddress = await getPeerAddress(connection, programId, _dstEid);
      execTime.log("deriveOftPdas+getPeerAddress");

      execTime.breakpoint();
      const tokenSource = await getAssociatedTokenAddress(
        tokenMint,
        userPubkey,
        false,
        TOKEN_PROGRAM_ID,
      );
      execTime.log("getAssociatedTokenAddress");

      const sendHelper = new SendHelper();
      execTime.breakpoint();
      const remainingAccounts = await sendHelper.getQuoteAccounts(
        connection as any,
        quotePayer,
        pdas.oftStore,
        _dstEid,
        peerAddress,
      );
      execTime.log("sendHelper.getQuoteAccounts");

      const ix = new TransactionInstruction({
        programId,
        keys: [
          { pubkey: pdas.oftStore, isSigner: false, isWritable: false },
          { pubkey: pdas.credits, isSigner: false, isWritable: false },
          { pubkey: pdas.peer, isSigner: false, isWritable: false },
          ...remainingAccounts,
        ],
        data: Buffer.from(
          encodeQuoteSend({
            dstEid: _dstEid,
            to,
            amountLd,
            minAmountLd,
            extraOptions,
            composeMsg,
            payInLzToken: false,
          }),
        ),
      });

      execTime.breakpoint();
      const computeIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
      const tx: any = await buildVersionedTransaction(
        connection as any,
        quotePayer,
        [computeIx, ix],
        undefined,
        undefined,
        lookupTable,
      );
      const sim = await connection.simulateTransaction(tx, {
        sigVerify: false,
        replaceRecentBlockhash: true,
      });
      execTime.log("buildTx+simulateTransaction(quote)");

      if (sim.value.err) {
        console.error('Simulation logs:', sim, JSON.stringify(sim));
        throw new Error(`Quote failed: ${JSON.stringify(sim.value.err)}`);
      }

      const prefix = `Program return: ${programId} `;
      const log = sim.value.logs?.find((l) => l.startsWith(prefix));
      if (!log) throw new Error('Return data not found');

      const data = Buffer.from(log.slice(prefix.length), 'base64');

      let nativeFee = data.readBigUInt64LE(0);
      csl("Solana quoteOFT", "purple-500", "nativeFee: %o", nativeFee);
      nativeFee = nativeFee * NATIVE_MSG_FEE_BUFFER / 100n;
      csl("Solana quoteOFT", "purple-500", "nativeFee after buffer: %o", nativeFee);
      const lzTokenFee = data.readBigUInt64LE(8);

      // Convert nativeFee to USD if prices are available
      if (prices && fromToken.nativeToken) {
        const nativeFeeUsd = Big(nativeFee.toString())
          .div(10 ** fromToken.nativeToken.decimals)
          .times(getPrice(prices, fromToken.nativeToken.symbol));
        result.fees.nativeFeeUsd = numberRemoveEndZero(nativeFeeUsd.toFixed(20));
      }
      result.fees.nativeFee = Big(nativeFee.toString())
        .div(10 ** fromToken.nativeToken.decimals)
        .toFixed(fromToken.nativeToken.decimals, 0);
      result.totalEstimateSourceGas = nativeFee;

      if (lzTokenFee > 0n && prices && fromToken) {
        const lzTokenFeeUsd = Big(lzTokenFee.toString())
          .div(10 ** fromToken.decimals)
          .times(getPrice(prices, fromToken.symbol));
        result.fees.lzTokenFeeUsd = numberRemoveEndZero(lzTokenFeeUsd.toFixed(20));
      }
      result.fees.lzTokenFee = lzTokenFee.toString();

      let sendTx: any;
      let sendComputeBudget: ComputeBudgetResult | undefined;
      if (!dry) {
        // send
        const sendSendHelper = new SendHelper();
        execTime.breakpoint();
        const sendRemainingAccounts = await sendSendHelper.getSendAccounts(
          connection as any,
          userPubkey,
          pdas.oftStore,
          _dstEid,
          peerAddress,
        );
        execTime.log("getSendAccounts");

        const sendIx = new TransactionInstruction({
          programId,
          keys: [
            { pubkey: userPubkey, isSigner: true, isWritable: true },
            { pubkey: pdas.peer, isSigner: false, isWritable: false },
            { pubkey: pdas.oftStore, isSigner: false, isWritable: true },
            { pubkey: pdas.credits, isSigner: false, isWritable: true },
            { pubkey: tokenSource, isSigner: false, isWritable: true },
            { pubkey: tokenEscrow, isSigner: false, isWritable: true },
            { pubkey: tokenMint, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: pdas.eventAuthority, isSigner: false, isWritable: false },
            { pubkey: programId, isSigner: false, isWritable: false },
            ...sendRemainingAccounts,
          ],
          data: Buffer.from(
            encodeSend({
              dstEid: _dstEid,
              to,
              amountLd,
              minAmountLd,
              extraOptions,
              composeMsg,
              nativeFee,
              lzTokenFee: 0n,
            }),
          ),
        });

        execTime.breakpoint();
        const lookupTables = await fetchLookupTableAccounts({ connection, addresses: [lookupTable] });
        sendComputeBudget = await buildComputeBudgetIxs({
          connection,
          payer: userPubkey,
          instructions: [sendIx],
          lookupTables,
          fallbackUnits: OFT_SEND_FALLBACK_UNITS,
        });
        sendTx = await buildVersionedTransaction(
          connection as any,
          userPubkey,
          [...sendComputeBudget.ixs, sendIx],
          undefined,
          undefined,
          lookupTable,
        );
        execTime.log("buildTx+simulateTransaction(send)");
      }

      const ett = await this.estimateTransaction({
        dry,
        versionedTx: sendTx,
        fromToken,
        prices,
        priorityFeeLamports: sendComputeBudget?.priorityFeeLamports,
      });

      result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
      result.fees.accountRentUsd = ett.accountRentUsd;
      result.estimateSourceGasUsd = ett.estimateSourceGasUsd;
      result.estimateSourceGas = ett.estimateSourceGas;
      result.totalEstimateSourceGas += ett.estimateSourceGas + ett.accountRentLamports;

      // 0.03% fee for Legacy Mesh transfers only (native USDT0 transfers are free)
      result.fees.legacyMeshFeeUsd = numberRemoveEndZero(Big(amountLdClean || 0).div(10 ** params.fromToken.decimals).times(USDT0_LEGACY_MESH_TRANSFTER_FEE).toFixed(params.fromToken.decimals));
      result.outputAmount = numberRemoveEndZero(Big(Big(amountLdClean || 0).div(10 ** params.fromToken.decimals)).minus(result.fees.legacyMeshFeeUsd || 0).toFixed(params.fromToken.decimals, 0));

      // Check if the output amount exceeds the slippage tolerance
      // If it exceeds, return an error message
      csl("SolanaWallet quoteOFT", "red-600", "result.outputAmount: %o", result.outputAmount);
      csl("SolanaWallet quoteOFT", "red-600", "slippageTolerance: %o", slippageTolerance + "%");
      csl("SolanaWallet quoteOFT", "red-600", "Minimum received amount: %o", Big(amountLdClean).div(10 ** fromToken.decimals).times(Big(1).minus(Big(slippageTolerance || 0).div(100))).toFixed(6, 0));
      if (Big(result.outputAmount).lt(Big(amountLdClean).div(10 ** fromToken.decimals).times(Big(1).minus(Big(slippageTolerance || 0).div(100))))) {
        result.errMsg = "Slippage limit exceeded";
        result.errLevel = QuoteErrorLevel.Business;
        return result;
      }

      result.sendParam = {
        transaction: sendTx,
        versionedTx: sendTx,
        // Services re-run estimateTransaction with `...sendParam`; carrying these keeps the
        // refreshed estimate identical to the one produced here.
        priorityFeeLamports: sendComputeBudget?.priorityFeeLamports,
        broadcastMeta: this.buildBroadcastMeta({
          route: ServiceBackend[Service.Usdt0],
          fromTokenSymbol: fromToken?.symbol,
          computeBudget: sendComputeBudget,
        }),
      };

      // Calculate total fees
      for (const feeKey in result.fees) {
        if (excludeFees && excludeFees.includes(feeKey) || !/Usd$/.test(feeKey)) {
          continue;
        }
        result.totalFeesUsd = Big(result.totalFeesUsd || 0).plus(result.fees[feeKey] || 0);
      }
      result.totalFeesUsd = numberRemoveEndZero(Big(result.totalFeesUsd || 0).toFixed(20));

      execTime.logTotal("quoteOFT");

      return result;
    } catch (error: any) {
      csl("Solana quoteOFT", "red-500", "quoteOFT failed: %o", error);
      return { errMsg: error.message, errLevel: QuoteErrorLevel.Fallback };
    }
  }

  async quotePyusdOFT(params: any) {
    const { Options } = await import("@layerzerolabs/lz-v2-utilities");
    const {
      dry,
      originLayerzeroAddress,
      fromToken,
      toToken,
      dstEid,
      refundTo,
      recipient,
      amountWei,
      slippageTolerance,
      prices,
      excludeFees,
      originLayerzero,
    } = params;

    const connection = this.getConnection();

    try {
      const result: any = {
        needApprove: false,
        sendParam: void 0,
        fees: {},
        estimateSourceGas: 0n,
        totalEstimateSourceGas: 0n,
        estimateSourceGasUsd: "0",
        outputAmount: numberRemoveEndZero(Big(amountWei || 0).div(10 ** fromToken.decimals).toFixed(fromToken.decimals, 0)),
        quoteParam: {
          ...params,
        },
        totalFeesUsd: "0",
        estimateTime: 0,
      };

      const execTime = new ExecTime({ type: "PYUSD Solana", logStyle: "fuchsia-100" });

      const programId = new PublicKey(originLayerzeroAddress || originLayerzero.programId || originLayerzero.oft);
      const tokenMint = new PublicKey(fromToken.contractAddress);
      const quotePayer = new PublicKey("9JXR51yBLBgfesHF8SJgKWkNnx4FxtJCxCc3AV31TBsn");
      const lookupTable = new PublicKey(originLayerzero.addressLookupTable);
      const oftStore = new PublicKey(originLayerzero.oftPDA);
      const tokenEscrow = new PublicKey(originLayerzero.escrow);
      const tokenProgram = new PublicKey(originLayerzero.innerTokenProgramId || TOKEN_2022_PROGRAM_ID);
      const sender = this.publicKey!;
      const userPubkey = new PublicKey(refundTo || sender.toString());

      const amountLd = BigInt(amountWei);
      const slippage = slippageTolerance || 0.01;
      const minAmountLd = BigInt(Big(amountWei).times(Big(1).minus(Big(slippage).div(100))).toFixed(0));
      const to = getBytes(addressToBytes32(toToken.chainType, recipient));
      const extraOptions = Options.newOptions().toBytes() as Uint8Array<any>;
      const composeMsg = null;

      execTime.breakpoint();
      const peer = derivePeerPda(programId, oftStore, dstEid);
      const eventAuthority = deriveEventAuthority(programId);
      const peerInfo = await connection.getAccountInfo(peer);
      if (!peerInfo) {
        throw new Error(`Peer not found for EID ${dstEid}`);
      }
      const peerAddress = `0x${peerInfo.data.subarray(8, 40).toString("hex")}` as `0x${string}`;
      execTime.log("derivePeerPda+getPeerAddress");

      execTime.breakpoint();
      const tokenSource = await getAssociatedTokenAddress(
        tokenMint,
        userPubkey,
        false,
        tokenProgram,
      );
      execTime.log("getAssociatedTokenAddress");

      const sendHelper = new SendHelper();
      execTime.breakpoint();
      const remainingAccounts = await sendHelper.getQuoteAccounts(
        connection as any,
        quotePayer,
        oftStore,
        dstEid,
        peerAddress,
      );
      execTime.log("sendHelper.getQuoteAccounts");

      const ix = new TransactionInstruction({
        programId,
        keys: [
          { pubkey: oftStore, isSigner: false, isWritable: false },
          { pubkey: peer, isSigner: false, isWritable: false },
          { pubkey: tokenMint, isSigner: false, isWritable: false },
          ...remainingAccounts,
        ],
        data: Buffer.from(
          encodeQuoteSend({
            dstEid,
            to,
            amountLd,
            minAmountLd,
            extraOptions,
            composeMsg,
            payInLzToken: false,
          }),
        ),
      });

      execTime.breakpoint();
      const computeIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
      const tx: any = await buildVersionedTransaction(
        connection as any,
        quotePayer,
        [computeIx, ix],
        undefined,
        undefined,
        lookupTable,
      );
      const sim = await connection.simulateTransaction(tx, {
        sigVerify: false,
        replaceRecentBlockhash: true,
      });
      execTime.log("buildTx+simulateTransaction(quote)");

      if (sim.value.err) {
        console.error("PYUSD quote simulation logs:", sim, JSON.stringify(sim));
        throw new Error(`Quote failed: ${JSON.stringify(sim.value.err)}`);
      }

      const prefix = `Program return: ${programId} `;
      const log = sim.value.logs?.find((l) => l.startsWith(prefix));
      if (!log) throw new Error("Return data not found");

      const data = Buffer.from(log.slice(prefix.length), "base64");

      let nativeFee = data.readBigUInt64LE(0);
      csl("Solana quotePyusdOFT", "purple-500", "nativeFee: %o", nativeFee);
      nativeFee = nativeFee * NATIVE_MSG_FEE_BUFFER / 100n;
      csl("Solana quotePyusdOFT", "purple-500", "nativeFee after buffer: %o", nativeFee);
      const lzTokenFee = data.readBigUInt64LE(8);

      if (prices && fromToken.nativeToken) {
        const nativeFeeUsd = Big(nativeFee.toString())
          .div(10 ** fromToken.nativeToken.decimals)
          .times(getPrice(prices, fromToken.nativeToken.symbol));
        result.fees.nativeFeeUsd = numberRemoveEndZero(nativeFeeUsd.toFixed(20));
      }
      result.fees.nativeFee = Big(nativeFee.toString())
        .div(10 ** fromToken.nativeToken.decimals)
        .toFixed(fromToken.nativeToken.decimals, 0);
      result.totalEstimateSourceGas = nativeFee;

      if (lzTokenFee > 0n && prices && fromToken) {
        const lzTokenFeeUsd = Big(lzTokenFee.toString())
          .div(10 ** fromToken.decimals)
          .times(getPrice(prices, fromToken.symbol));
        result.fees.lzTokenFeeUsd = numberRemoveEndZero(lzTokenFeeUsd.toFixed(20));
      }
      result.fees.lzTokenFee = lzTokenFee.toString();

      let sendTx: any;
      if (!dry) {
        const sendSendHelper = new SendHelper();
        execTime.breakpoint();
        const sendRemainingAccounts = await sendSendHelper.getSendAccounts(
          connection as any,
          userPubkey,
          oftStore,
          dstEid,
          peerAddress,
        );
        execTime.log("getSendAccounts");

        const sendIx = new TransactionInstruction({
          programId,
          keys: [
            { pubkey: userPubkey, isSigner: true, isWritable: false },
            { pubkey: peer, isSigner: false, isWritable: true },
            { pubkey: oftStore, isSigner: false, isWritable: true },
            { pubkey: tokenSource, isSigner: false, isWritable: true },
            { pubkey: tokenEscrow, isSigner: false, isWritable: true },
            { pubkey: tokenMint, isSigner: false, isWritable: true },
            { pubkey: tokenProgram, isSigner: false, isWritable: false },
            { pubkey: eventAuthority, isSigner: false, isWritable: false },
            { pubkey: programId, isSigner: false, isWritable: false },
            ...sendRemainingAccounts,
          ],
          data: Buffer.from(
            encodeSend({
              dstEid,
              to,
              amountLd,
              minAmountLd,
              extraOptions,
              composeMsg,
              nativeFee,
              lzTokenFee: 0n,
            }),
          ),
        });

        execTime.breakpoint();
        const computeSendIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
        sendTx = await buildVersionedTransaction(
          connection as any,
          userPubkey,
          [computeSendIx, sendIx],
          undefined,
          undefined,
          lookupTable,
        );
        execTime.log("buildTx(send)");
      }

      const ett = await this.estimateTransaction({
        dry,
        versionedTx: sendTx,
        fromToken,
        prices,
      });

      result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
      result.estimateSourceGasUsd = ett.estimateSourceGasUsd;
      result.estimateSourceGas = ett.estimateSourceGas;
      result.totalEstimateSourceGas += ett.estimateSourceGas;

      csl("SolanaWallet quotePyusdOFT", "red-600", "result.outputAmount: %o", result.outputAmount);
      csl("SolanaWallet quotePyusdOFT", "red-600", "slippageTolerance: %o", slippageTolerance + "%");
      csl("SolanaWallet quotePyusdOFT", "red-600", "Minimum received amount: %o", Big(amountWei).div(10 ** fromToken.decimals).times(Big(1).minus(Big(slippageTolerance || 0).div(100))).toFixed(6, 0));
      if (Big(result.outputAmount).lt(Big(amountWei).div(10 ** fromToken.decimals).times(Big(1).minus(Big(slippageTolerance || 0).div(100))))) {
        result.errMsg = "Slippage limit exceeded";
        return result;
      }

      result.sendParam = {
        transaction: sendTx,
        versionedTx: sendTx,
      };

      for (const feeKey in result.fees) {
        if (excludeFees && excludeFees.includes(feeKey) || !/Usd$/.test(feeKey)) {
          continue;
        }
        result.totalFeesUsd = Big(result.totalFeesUsd || 0).plus(result.fees[feeKey] || 0);
      }
      result.totalFeesUsd = numberRemoveEndZero(Big(result.totalFeesUsd || 0).toFixed(20));

      execTime.logTotal("quotePyusdOFT");

      return result;
    } catch (error: any) {
      csl("Solana quotePyusdOFT", "red-500", "quotePyusdOFT failed: %o", error);
      return { errMsg: error.message };
    }
  }

  async sendTransaction(params: any) {
    const { transaction, broadcastMeta } = params;

    const connection = this.getConnection();

    if (!this.publicKey) {
      throw new Error("Wallet not connected");
    }

    if (!transaction) {
      throw new Error("Transaction is required");
    }

    const hasAnySignature = (sig: Uint8Array | Buffer | null | undefined) =>
      !!sig && sig.length > 0 && Array.from(sig).some((byte) => byte !== 0);
    let latestBlockhash: Awaited<ReturnType<Connection["getLatestBlockhash"]>> | null = null;

    // Only refresh blockhash for unsigned transactions.
    // For pre-signed CCTP txs, mutating recentBlockhash invalidates existing signatures.
    if (transaction instanceof Transaction) {
      const isUnsigned = transaction.signatures.every(({ signature }) => !hasAnySignature(signature as any));
      if (isUnsigned) {
        latestBlockhash = await connection.getLatestBlockhash("confirmed");
        transaction.recentBlockhash = latestBlockhash.blockhash;
        if (!transaction.feePayer) {
          transaction.feePayer = this.publicKey;
        }
      }
    } else if (transaction instanceof VersionedTransaction) {
      const isUnsigned = transaction.signatures.every((signature) => !hasAnySignature(signature));
      if (isUnsigned) {
        latestBlockhash = await connection.getLatestBlockhash("confirmed");
        // web3.js does not expose a convenient mutator here in typings, but runtime object is mutable.
        (transaction.message as any).recentBlockhash = latestBlockhash.blockhash;
      }
    }

    // Pin the endpoint that just issued the blockhash for the send and the rebroadcast.
    const sendConnection = getActiveSolanaConnection(connection);

    // Sign the transaction
    const signedTransaction = await this.signTransaction(transaction);

    const rawTransaction = signedTransaction.serialize();

    let signature: string;
    try {
      // Send the transaction.
      // No maxRetries cap: the RPC node keeps rebroadcasting on its own until the blockhash expires.
      // skipPreflight stays false so transactions that cannot succeed never produce an unfindable hash.
      signature = await sendConnection.sendRawTransaction(rawTransaction, { skipPreflight: false });
    } catch (error: any) {
      if (error instanceof SendTransactionError) {
        try {
          const logs = await error.getLogs(connection);
          csl("Solana sendTransaction", "red-500", "sendRawTransaction failed logs: %o", logs);
        } catch (logsError: any) {
          csl("Solana sendTransaction", "red-500", "failed to fetch SendTransactionError logs: %o", logsError?.message || logsError);
        }
      }
      throw error;
    }

    csl("Solana sendTransaction", "green-400", "Transaction sent with signature: %o", signature);

    // Keep re-sending in the background. The caller gets the hash right away and reports it,
    // so nothing here waits for the transaction to land.
    startRebroadcast({
      connection: sendConnection,
      rawTransaction,
      signature,
      lastValidBlockHeight: latestBlockhash?.lastValidBlockHeight,
      report: {
        address: this.publicKey.toBase58(),
        ...(broadcastMeta || {}),
        rpcEndpoint: getRpcEndpointHost(sendConnection),
      },
    });

    return signature;
  }

  /**
   * Unified quote method that routes to specific quote methods based on type
   * @param type Service type from Service
   * @param params Parameters for the quote
   */
  async quote(type: Service, params: any) {
    switch (type) {
      case Service.CCTP:
        return this.quoteCCTP(params);
      case Service.Usdt0:
        return this.quoteOFT(params);
      case Service.Pyusd:
        return this.quotePyusdOFT(params);
      case Service.OneClick:
        return this.quoteOneClickProxy(params);
      case Service.FraxZero:
        return this.quoteFraxZero(params);
      default:
        throw new Error(`Unsupported quote type: ${type}`);
    }
  }

  /**
   * Sign and send a Rhea Solana tx payload (base64 serialized transaction).
   */
  async sendRheaTx(tx: any) {
    const serialized =
      tx?.transaction ||
      tx?.serializedTransaction ||
      tx?.serialized ||
      (typeof tx === "string" ? tx : null);

    if (!serialized || typeof serialized !== "string") {
      throw new Error("Invalid Solana Rhea tx payload: missing base64 transaction");
    }

    const raw = Buffer.from(serialized, "base64");
    // Solana rejects packets larger than 1232 bytes. Serialize then throws
    // "encoding overruns Uint8Array" inside the wallet.
    if (raw.length > 1232) {
      throw new Error("This route's transaction is too large to submit. Try another route.");
    }
    let transaction: Transaction | VersionedTransaction;
    try {
      transaction = VersionedTransaction.deserialize(raw);
    } catch {
      transaction = Transaction.from(raw);
    }

    return this.sendTransaction({ transaction });
  }

  /**
   * Unified send method that routes to specific send methods based on type
   * @param type Send type from SendType enum
   * @param params Parameters for the send transaction
   */
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

  async quoteOneClickProxy(params: any) {
    const {
      refundTo,
      proxyAddress,
      fromToken,
      amountWei,
      depositAddress,
    } = params;

    const connection = this.getConnection();

    const result: any = { fees: {} };
    try {
      const execTime = new ExecTime({ type: "Oneclick Solana", logStyle: "fuchsia-200" });

      const PROGRAM_ID = new PublicKey(proxyAddress);
      const STATE_PDA = new PublicKey("9E8az3Y9sdXvM2f3CCH6c9N3iFyNfDryQCZhqDxRYGUw");
      const MINT = new PublicKey(fromToken.contractAddress);
      const AMOUNT = new BN(amountWei);
      const RECIPIENT = new PublicKey(depositAddress);
      const sender = this.publicKey!;
      const userPubkey = new PublicKey(refundTo || sender.toString());

      // Create AnchorProvider
      const provider = new AnchorProvider(connection, this.signer, {
        commitment: "confirmed"
      });

      // Create Program instance
      const program = new Program<any>(stableflowProxyIdl, PROGRAM_ID, provider);

      // Get user's token account (ATA)
      execTime.breakpoint();
      const userTokenAccount = getAssociatedTokenAddressSync(MINT, userPubkey);
      execTime.log("Get user's token account (ATA)");

      // Get recipient's token account (ATA)
      execTime.breakpoint();
      const toTokenAccount = getAssociatedTokenAddressSync(MINT, RECIPIENT);
      execTime.log("Get recipient's token account (ATA)");

      const transaction = new Transaction();

      execTime.breakpoint();
      let needCreateToTokenAccount = false;
      try {
        await getAccount(connection, toTokenAccount);
      } catch (error) {
        needCreateToTokenAccount = true;
        transaction.add(
          createAssociatedTokenAccountInstruction(
            userPubkey,
            toTokenAccount,
            RECIPIENT,
            MINT
          )
        );
      }
      execTime.log("getAccount(toTokenAccount)");

      execTime.breakpoint();
      const transferInstruction = await program.methods
        .transfer(AMOUNT)
        .accounts({
          stableFlowState: STATE_PDA,
          tokenMint: MINT,
          userTokenAccount: userTokenAccount,
          toTokenAccount: toTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          user: userPubkey,
          toUser: RECIPIENT,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      execTime.log("program.methods.transfer.instruction");

      transaction.add(transferInstruction);

      execTime.breakpoint();
      const computeBudget = await buildComputeBudgetIxs({
        connection,
        payer: userPubkey,
        instructions: transaction.instructions,
        fallbackUnits: ONECLICK_PROXY_FALLBACK_UNITS,
      });
      transaction.instructions.unshift(...computeBudget.ixs);
      execTime.log("buildComputeBudgetIxs");

      execTime.breakpoint();
      const { blockhash } = await connection.getLatestBlockhash();
      execTime.log("getLatestBlockhash");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPubkey;

      execTime.breakpoint();
      const message = transaction.compileMessage();
      const versionedTx = new VersionedTransaction(message);
      const fallbackRentLamports = needCreateToTokenAccount ? await getAssociatedTokenAccountRent(connection) : 0;

      result.sendParam = {
        transaction,
        versionedTx,
        // The async estimate spreads sendParam, so these keep that fee identical to this build.
        priorityFeeLamports: computeBudget.priorityFeeLamports,
        fallbackRentLamports,
        broadcastMeta: this.buildBroadcastMeta({
          route: ServiceBackend[Service.OneClick],
          fromTokenSymbol: fromToken?.symbol,
          computeBudget,
        }),
      };

      execTime.logTotal("quoteOneClickPorxy");

      return result;
    } catch (error: any) {
      csl("Solana quoteOneClickProxy", "red-500", "error: %o", error);
      return result;
    }
  }

  async quoteCCTP(params: any) {
    const {
      dry,
      proxyAddress,
      refundTo,
      recipient,
      amountWei,
      slippageTolerance,
      fromToken,
      prices,
      excludeFees,
      destinationDomain,
      sourceDomain,
    } = params;

    const connection = this.getConnection();

    try {
      const result: any = {
        needApprove: false,
        approveSpender: proxyAddress,
        sendParam: void 0,
        quoteParam: {
          sourceDomain,
          destinationDomain,
          proxyAddress,
          ...params,
        },
        fees: {},
        totalFeesUsd: void 0,
        estimateSourceGas: void 0,
        totalEstimateSourceGas: 0n,
        estimateSourceGasUsd: void 0,
        estimateTime: Math.floor(Math.random() * 8) + 3,
        outputAmount: numberRemoveEndZero(Big(amountWei || 0).div(10 ** fromToken.decimals).toFixed(fromToken.decimals, 0)),
      };

      const execTime = new ExecTime({ type: "CCTP Solana", logStyle: "fuchsia-300" });

      const PROGRAM_ID = new PublicKey(proxyAddress);
      const MINT = new PublicKey(fromToken.contractAddress);
      const sender = this.publicKey!;
      const userPubkey = new PublicKey(refundTo || sender.toString());

      const [userStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user"), userPubkey.toBuffer()],
        PROGRAM_ID
      );

      let userNonce = 0;
      execTime.breakpoint();
      try {
        const accountInfo = await connection.getAccountInfo(userStatePda);
        if (accountInfo && accountInfo.data) {
          // UserState structure: user (32 bytes) + nonce (8 bytes) + bump (1 byte)
          // Skip user (32 bytes) and read nonce (8 bytes, little-endian)
          const nonceBuffer = accountInfo.data.slice(32, 40);
          userNonce = Number(new BN(nonceBuffer, "le").toString());
        }
      } catch (error) {
        csl("Solana quoteCCTP", "red-500", "UserState not found, using nonce 0");
      }
      execTime.log("getAccountInfo(userStatePda)");

      const userTokenAccount = getAssociatedTokenAddressSync(MINT, userPubkey);

      execTime.breakpoint();
      const signatureRes = await quoteSignature({
        address: userPubkey.toString(),
        amount: numberRemoveEndZero(Big(amountWei || 0).div(10 ** fromToken.decimals).toFixed(fromToken.decimals, 0)),
        destination_domain_id: destinationDomain,
        receipt_address: recipient,
        source_domain_id: sourceDomain,
        ata_address: userTokenAccount,
      });
      execTime.log("quoteSignature from our api");

      const {
        bridge_fee,
        max_fee,
        mint_fee,
        receipt_amount,
        signature,
      } = signatureRes;

      result.fees.estimateMintGasUsd = numberRemoveEndZero(
        Big(mint_fee || 0)
          .div(10 ** fromToken.decimals)
          .toFixed(fromToken.decimals)
      );
      result.fees.bridgeFeeUsd = numberRemoveEndZero(
        Big(bridge_fee || 0)
          .div(10 ** fromToken.decimals)
          .toFixed(fromToken.decimals)
      );
      result.outputAmount = numberRemoveEndZero(
        Big(receipt_amount || 0)
          .div(10 ** fromToken.decimals)
          .toFixed(fromToken.decimals, 0)
      );

      const cctpFeeRate = Big(max_fee || 0).div(amountWei || 1);
      const slippageLimit = Big(slippageTolerance || 0).div(100);
      csl("SolanaWallet quoteCCTP", "red-600", "cctpFeeRate: %o, slippageLimit: %o", cctpFeeRate.toFixed(6), slippageLimit.toFixed(6));
      if (max_fee && amountWei && cctpFeeRate.gt(slippageLimit)) {
        result.errMsg = "Slippage limit exceeded";
        result.errLevel = QuoteErrorLevel.Business;
        return result;
      }

      const operatorTx = Transaction.from(Buffer.from(signature, 'base64'));

      if (!operatorTx.verifySignatures(false)) {
        csl("Solana quoteCCTP", "red-500", "Signature verification failed");
      } else {
        csl("Solana quoteCCTP", "purple-400", "Signature verification success");
      }

      execTime.breakpoint();
      const message = operatorTx.compileMessage();
      const versionedTx = new VersionedTransaction(message);
      const ett = await this.estimateTransaction({
        dry,
        versionedTx,
        fromToken,
        prices,
      });
      execTime.log("estimateTransaction");

      result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
      result.fees.accountRentUsd = ett.accountRentUsd;
      result.estimateSourceGas = ett.estimateSourceGas;
      result.totalEstimateSourceGas = ett.estimateSourceGas + ett.accountRentLamports;
      result.estimateSourceGasUsd = ett.estimateSourceGasUsd;

      result.sendParam = {
        transaction: operatorTx,
        versionedTx,
        // Pre-signed by the operator: adding instructions would invalidate the signature,
        // so this route only gets the background rebroadcast.
        broadcastMeta: this.buildBroadcastMeta({
          route: ServiceBackend[Service.CCTP],
          fromTokenSymbol: fromToken?.symbol,
        }),
      };

      // Calculate total fees
      for (const feeKey in result.fees) {
        if (excludeFees && excludeFees.includes(feeKey) || !/Usd$/.test(feeKey)) {
          continue;
        }
        result.totalFeesUsd = Big(result.totalFeesUsd || 0).plus(result.fees[feeKey] || 0);
      }
      result.totalFeesUsd = numberRemoveEndZero(Big(result.totalFeesUsd || 0).toFixed(20));

      execTime.logTotal("quoteCCTP");

      return result;
    } catch (error: any) {
      csl("Solana quoteCCTP", "red-500", "quoteCCTP failed: %o", error);
      return { errMsg: error.message, errLevel: QuoteErrorLevel.Fallback };
    }
  }

  async createAssociatedTokenAddress(params: any) {
    const {
      tokenMint,
    } = params;

    const connection = this.getConnection();

    if (!this.publicKey) {
      throw new Error("Wallet not connected");
    }

    const ownerPubkey = this.publicKey;
    const mint = new PublicKey(tokenMint);
    const associatedTokenAccount = getAssociatedTokenAddressSync(mint, ownerPubkey);

    csl("Solana createAssociatedTokenAddress", "purple-400", "associatedTokenAccount: %o", associatedTokenAccount);

    const createTokenAccount = async () => {
      const transaction = new Transaction();

      transaction.add(
        createAssociatedTokenAccountInstruction(
          ownerPubkey,
          associatedTokenAccount,
          ownerPubkey,
          mint
        )
      );

      const computeBudget = await buildComputeBudgetIxs({
        connection,
        payer: ownerPubkey,
        instructions: transaction.instructions,
        fallbackUnits: CREATE_ATA_FALLBACK_UNITS,
      });
      transaction.instructions.unshift(...computeBudget.ixs);

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = ownerPubkey;

      const signedTransaction = await this.signTransaction(transaction);

      const signature = await connection.sendRawTransaction(
        signedTransaction.serialize()
      );

      // Later steps need the ATA to actually exist, so this wait stays synchronous.
      await this.checkTransactionStatus(signature);

      return associatedTokenAccount;
    };

    try {
      const accountRes = await getAccount(connection, associatedTokenAccount);
      csl("Solana createAssociatedTokenAddress", "purple-400", "associatedTokenAccount account: %o", accountRes);
      return associatedTokenAccount;
    } catch (error) {
      csl("Solana createAssociatedTokenAddress", "red-500", "get ata failed: %o", error);
    }

    return createTokenAccount();
  }

  async quoteFraxZero(params: any) {
    const {
      dry,
      recipient,
      amountWei,
      slippageTolerance,
      fromToken,
      toToken,
      prices,
      excludeFees,
      refundTo,
      originLayerzero,
      destinationLayerzero,
    } = params;

    const connection = this.getConnection();

    const execTime = new ExecTime({ type: "FraxZero Solana", logStyle: "fuchsia-400" });

    csl("Solana quoteFraxZero", "purple-500", "params: %o", params);

    const amountLdClean = removeOftDust(amountWei || 0, fromToken.decimals);
    const result: any = {
      needApprove: false,
      approveSpender: void 0,
      sendParam: void 0,
      quoteParam: {
        ...params,
      },
      fees: {},
      totalFeesUsd: 0,
      estimateSourceGas: 0n,
      totalEstimateSourceGas: 0n,
      estimateSourceGasUsd: 0,
      estimateTime: 0,
      outputAmount: numberRemoveEndZero(Big(amountLdClean || 0).div(10 ** params.fromToken.decimals).toFixed(params.fromToken.decimals, 0)),
    };

    if (BigInt(amountLdClean) === 0n) {
      result.errMsg = "Amount below minimum cross-chain unit";
      result.errLevel = QuoteErrorLevel.Business;
      return result;
    }

    const sender = this.publicKey!;
    const userPubkey = fromWeb3JsPublicKey(new PublicKey(refundTo || sender.toString()));
    const {
      eid: srcEid,
      remoteHop,
      lockbox,
    } = originLayerzero;
    const {
      eid: dstEid,
    } = destinationLayerzero;

    const availableRpcUrl = await getAvailableSolanaRpcUrl({ isQuerySignature: true });

    const ALT_ADDRESS = new PublicKey("AokBxha6VMLLgf97B5VYHEtqztamWmYERBmmFvjuTzJB");
    const umi = createUmi(availableRpcUrl, "confirmed").use(mplToolbox());
    const oftProgramId = publicKey(originLayerzero.programId);
    const oftMint = publicKey(fromToken.contractAddress);
    const oftEscrow = publicKey(originLayerzero.escrow);
    const tokenProgramId = publicKey(TOKEN_PROGRAM_ID);
    const tokenAccount = findAssociatedTokenPda(umi, {
      mint: oftMint,
      owner: userPubkey,
      tokenProgramId,
    });

    execTime.breakpoint();
    await safeFetchToken(umi, tokenAccount[0]);
    execTime.log("safeFetchToken");

    const recipientAddressBytes32 = addressToBytes32(toToken.chainType, recipient);
    const amountLd = BigInt(amountLdClean);
    const minAmountLd = BigInt(Big(amountLdClean).times(Big(1).minus(Big(slippageTolerance || 0).div(100))).toFixed(0));

    execTime.breakpoint();
    const { value: lookupTableAccount } = await connection.getAddressLookupTable(ALT_ADDRESS);
    execTime.log("getAddressLookupTable", "ALT_ADDRESS: %o, lookupTableAccount: %o", ALT_ADDRESS, lookupTableAccount);
    if (!lookupTableAccount) {
      throw new Error("ALT not found");
    }

    execTime.breakpoint();
    let { nativeFee, lzTokenFee } = await oft.quote(
      umi.rpc,
      {
        payer: userPubkey,
        tokenMint: oftMint,
        tokenEscrow: oftEscrow,
      },
      {
        payInLzToken: false,
        to: getBytes(recipientAddressBytes32),
        dstEid: dstEid,
        amountLd,
        minAmountLd,
        options: Buffer.from(""),
        composeMsg: undefined,
      },
      {
        oft: oftProgramId,
      },
    );
    execTime.log("oft.quote", "nativeFee: %s, lzTokenFee: %s", nativeFee, lzTokenFee);
    nativeFee = nativeFee * NATIVE_MSG_FEE_BUFFER / 100n;
    csl("Solana quoteFraxZero", "purple-500", "nativeFee after buffer: %o", nativeFee);

    // oft.send() internally simulates the tx via umi.rpc without replaceRecentBlockhash,
    // so it can transiently fail with BlockhashNotFound when RPC nodes are out of sync.
    execTime.breakpoint();
    let ix: Awaited<ReturnType<typeof oft.send>>;
    let oftSendRetries = 0;
    const OFT_SEND_MAX_RETRIES = 3;
    while (true) {
      try {
        ix = await oft.send(
          umi.rpc,
          {
            payer: {
              ...this.signer,
              publicKey: userPubkey,
            },
            tokenMint: oftMint,
            tokenEscrow: oftEscrow,
            tokenSource: tokenAccount[0],
          },
          {
            to: getBytes(recipientAddressBytes32),
            dstEid,
            amountLd,
            minAmountLd,
            options: Buffer.from(''),
            composeMsg: undefined,
            nativeFee,
            lzTokenFee: 0n,
          },
          {
            oft: oftProgramId,
            token: tokenProgramId,
          },
        );
        break;
      } catch (err: any) {
        const isBlockhashNotFound =
          err?.message?.includes('BlockhashNotFound') ||
          JSON.stringify(err)?.includes('BlockhashNotFound');
        if (isBlockhashNotFound && oftSendRetries < OFT_SEND_MAX_RETRIES) {
          oftSendRetries++;
          csl("Solana quoteFraxZero", "yellow-500", "oft.send BlockhashNotFound, retrying (%o/%o)...", oftSendRetries, OFT_SEND_MAX_RETRIES);
          await new Promise((r) => setTimeout(r, 500 * oftSendRetries));
          continue;
        }
        throw err;
      }
    }

    execTime.log("oft.senbd", "oft send retry times: %s", oftSendRetries);
    csl("Solana quoteFraxZero", "purple-500", "ix: %o", ix);

    const web3Instruction = toWeb3JsInstruction(ix.instruction);
    execTime.breakpoint();
    const computeBudget = await buildComputeBudgetIxs({
      connection,
      payer: new PublicKey(userPubkey),
      instructions: [web3Instruction],
      lookupTables: [lookupTableAccount],
      fallbackUnits: FRAX_ZERO_FALLBACK_UNITS,
    });
    execTime.log("buildComputeBudgetIxs");
    execTime.breakpoint();
    const { blockhash } = await connection.getLatestBlockhash();
    execTime.log("getLatestBlockhash");
    const messageV0 = new TransactionMessage({
      payerKey: new PublicKey(userPubkey),
      recentBlockhash: blockhash,
      instructions: [...computeBudget.ixs, web3Instruction],
    }).compileToV0Message([lookupTableAccount]);
    const transaction = new VersionedTransaction(messageV0);

    csl("Solana quoteFraxZero", "purple-500", "transaction: %o", transaction);

    result.sendParam = {
      transaction,
      versionedTx: transaction,
      // Services re-run estimateTransaction with `...sendParam`; carrying this keeps the
      // refreshed estimate identical to the one produced here.
      priorityFeeLamports: computeBudget.priorityFeeLamports,
      broadcastMeta: this.buildBroadcastMeta({
        route: ServiceBackend[Service.FraxZero],
        fromTokenSymbol: fromToken?.symbol,
        computeBudget,
      }),
    };

    execTime.breakpoint();
    const ett = await this.estimateTransaction({
      dry,
      versionedTx: transaction,
      fromToken,
      prices,
      priorityFeeLamports: computeBudget.priorityFeeLamports,
    });
    execTime.log("estimateTransaction");

    const nativeFeeUsd = Big(nativeFee.toString())
      .div(10 ** fromToken.nativeToken.decimals)
      .times(getPrice(prices, fromToken.nativeToken.symbol));
    result.fees.nativeFeeUsd = numberRemoveEndZero(nativeFeeUsd.toFixed(20));

    const lzTokenFeeUsd = Big(lzTokenFee ? lzTokenFee.toString() : 0)
      .div(10 ** fromToken.decimals)
      .times(getPrice(prices, fromToken.symbol));
    result.fees.lzTokenFeeUsd = numberRemoveEndZero(lzTokenFeeUsd.toFixed(20));

    result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
    result.fees.accountRentUsd = ett.accountRentUsd;
    result.estimateSourceGasUsd = ett.estimateSourceGasUsd;
    result.estimateSourceGas = ett.estimateSourceGas;
    result.totalEstimateSourceGas = ett.estimateSourceGas + ett.accountRentLamports + nativeFee;

    result.fees.nativeFee = Big(nativeFee.toString())
      .div(10 ** fromToken.nativeToken.decimals)
      .toFixed(fromToken.nativeToken.decimals, 0);
    result.fees.lzTokenFee = lzTokenFee.toString();

    for (const feeKey in result.fees) {
      if (excludeFees && excludeFees.includes(feeKey) || !/Usd$/.test(feeKey)) {
        continue;
      }
      result.totalFeesUsd = Big(result.totalFeesUsd || 0).plus(result.fees[feeKey] || 0);
    }
    result.totalFeesUsd = numberRemoveEndZero(Big(result.totalFeesUsd || 0).toFixed(20));

    execTime.logTotal("quoteFraxZero");

    return result;
  }
}
