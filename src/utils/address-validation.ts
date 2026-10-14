import { Address } from "@ton/ton";
import bs58 from "bs58";
import { zeroPadValue } from "ethers";

// Address validation utilities for different blockchains

export interface AddressValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates an address based on the target blockchain
 * @param address - The address to validate
 * @param blockchain - The target blockchain key
 * @returns AddressValidationResult with validation status and error message
 */
export function validateAddress(
  address: string,
  blockchain: string
): AddressValidationResult {
  if (!address.trim()) {
    return {
      isValid: false,
      error: "Address cannot be empty"
    };
  }

  const trimmedAddress = address.trim();

  switch (blockchain) {
    case "near":
      return validateNearAddress(trimmedAddress);
    case "sol":
      return validateSolanaAddress(trimmedAddress);
    case "evm":
      return validateEthereumAddress(trimmedAddress);
    case "aptos":
      return validateAptosAddress(trimmedAddress);
    case "tron":
      return validateTronAddress(trimmedAddress);
    case "ton":
      return validateTonAddress(trimmedAddress);
    case "btc":
      return validateBtcAddress(trimmedAddress);
    case "zcash":
    case "zec":
      return validateZcashAddress(trimmedAddress);
    default:
      return {
        isValid: false,
        error: "Unsupported blockchain"
      };
  }
}

/**
 * Validates a NEAR address
 * Supports named accounts (alice.near, burrow.sputnik-dao.near) and
 * implicit accounts (64-char hex public key hash).
 */
function validateNearAddress(address: string): AddressValidationResult {
  // Length check
  if (address.length < 2 || address.length > 64) {
    return {
      isValid: false,
      error: "NEAR address must be 2-64 characters long"
    };
  }

  // Additional checks
  if (address.startsWith(".") || address.endsWith(".")) {
    return {
      isValid: false,
      error: "NEAR address cannot start or end with a dot"
    };
  }

  if (address.includes("..")) {
    return {
      isValid: false,
      error: "NEAR address cannot contain consecutive dots"
    };
  }

  // NEAR implicit accounts: 64-char hex string
  if (/^[0-9a-f]{64}$/i.test(address)) {
    return { isValid: true };
  }

  // Named account: letters, numbers and separators ., -, _
  const nearPattern = /^[a-zA-Z0-9._-]+$/;
  if (!nearPattern.test(address)) {
    return {
      isValid: false,
      error: "Invalid NEAR address"
    };
  }

  // Every account label should start/end with alphanumeric.
  const labelPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9_-]*[a-zA-Z0-9])?$/;
  const labels = address.split(".");
  if (!labels.every(label => labelPattern.test(label))) {
    return {
      isValid: false,
      error: "NEAR address labels must start/end with letters or numbers"
    };
  }

  // Named NEAR account cannot be purely numeric.
  if (/^\d+$/.test(address)) {
    return {
      isValid: false,
      error: "NEAR address cannot be purely numeric"
    };
  }

  const hasLetterPattern = /[a-zA-Z]/;
  if (!hasLetterPattern.test(address)) {
    return {
      isValid: false,
      error: "NEAR address must contain at least one letter"
    };
  }

  return { isValid: true };
}

/**
 * Validates a Solana address
 * Solana addresses are base58 encoded and typically 32-44 characters long
 */
function validateSolanaAddress(address: string): AddressValidationResult {
  // Solana address pattern: base58 encoded, typically 32-44 characters
  const solanaPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  if (!solanaPattern.test(address)) {
    return {
      isValid: false,
      error: "Invalid Solana address"
    };
  }

  return { isValid: true };
}

/**
 * Validates an Ethereum address (used for Arbitrum)
 * Ethereum addresses are 42 characters long, starting with 0x
 */
function validateEthereumAddress(address: string): AddressValidationResult {
  // Ethereum address pattern: 0x followed by 40 hexadecimal characters
  const ethereumPattern = /^0x[a-fA-F0-9]{40}$/;

  if (!ethereumPattern.test(address)) {
    return {
      isValid: false,
      error: "Invalid Ethereum address"
    };
  }

  return { isValid: true };
}

/**
 * Validates an Aptos address
 * Aptos addresses are 32 bytes (64 hex characters), optionally prefixed with 0x
 */
function validateAptosAddress(address: string): AddressValidationResult {
  // Aptos address can be with or without 0x prefix
  // With 0x: 0x + 64 hex characters = 66 characters total
  // Without 0x: 64 hex characters
  const aptosPatternWithPrefix = /^0x[a-fA-F0-9]{64}$/;
  const aptosPatternWithoutPrefix = /^[a-fA-F0-9]{64}$/;

  if (!aptosPatternWithPrefix.test(address) && !aptosPatternWithoutPrefix.test(address)) {
    return {
      isValid: false,
      error: "Invalid Aptos address"
    };
  }

  return { isValid: true };
}

/**
 * Validates a TON address
 * TON addresses can be in user-friendly format (EQ...) or raw format (workchain:hash)
 */
function validateBtcAddress(address: string): AddressValidationResult {
  const p2pkhOrP2sh = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
  const bech32 = /^bc1[qp][a-z0-9]{38,58}$/i;

  if (!p2pkhOrP2sh.test(address) && !bech32.test(address)) {
    return {
      isValid: false,
      error: "Invalid Bitcoin address",
    };
  }

  return { isValid: true };
}

function validateZcashAddress(address: string): AddressValidationResult {
  const transparent = /^t[13][a-zA-Z0-9]{33,}$/;
  const unified = /^u1[a-z0-9]{50,}$/i;
  const sapling = /^zs1[a-z0-9]{50,}$/i;

  if (!transparent.test(address) && !unified.test(address) && !sapling.test(address)) {
    return {
      isValid: false,
      error: "Invalid Zcash address",
    };
  }

  return { isValid: true };
}

function validateTonAddress(address: string): AddressValidationResult {
  try {
    Address.parse(address);
    return { isValid: true };
  } catch {
    return {
      isValid: false,
      error: "Invalid TON address"
    };
  }
}

/**
 * Validates a Tron address
 * Tron addresses are Base58 encoded, starting with T, and 34 characters long
 */
function validateTronAddress(address: string): AddressValidationResult {
  // Tron address pattern: Base58 encoded, starts with T, 34 characters long
  // Base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz (no 0, O, I, l)
  const tronPattern = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

  if (!tronPattern.test(address)) {
    return {
      isValid: false,
      error: "Invalid Tron address"
    };
  }

  return { isValid: true };
}

/**
 * Gets a placeholder text for the address input based on the target blockchain
 */
export function getAddressPlaceholder(blockchain: string): string {
  switch (blockchain) {
    case "near":
      return "Enter NEAR wallet address (e.g., alice.near or 64-char hex)";
    case "sol":
      return "Enter Solana wallet address (e.g., 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM)";
    case "arb":
      return "Enter Ethereum/Arbitrum wallet address (e.g., 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6)";
    case "aptos":
      return "Enter Aptos wallet address (e.g., 0x93493b07d031c4f18ad1e874575761be7e47d4cea5c81d538600e8ec72d6ab1c)";
    case "tron":
      return "Enter Tron wallet address (e.g., TG4cfJGzvmpWxYyQKSosCWTacKCxEwSiKw)";
    case "btc":
      return "Enter Bitcoin wallet address (e.g., bc1q... or 1... / 3...)";
    case "zcash":
    case "zec":
      return "Enter Zcash wallet address (e.g., t1... / u1... / zs1...)";
    default:
      return "Enter recipient wallet address";
  }
}

/**
 * Convert Tron address to bytes32 format (for LayerZero OFT)
 * @param {string} tronAddress - Tron address in Base58check format (starts with T)
 * @returns {string} Address in bytes32 format (starts with 0x, left-padded with zeros)
 */
export function tronAddressToBytes32(tronAddress: string) {
  try {
    // 1. Decode base58check format
    const decoded = bs58.decode(tronAddress);

    // 2. Remove the first byte (0x41 prefix) and the last 4 bytes (checksum)
    // Tron address structure: [0x41] + [20-byte address] + [4-byte checksum]
    const addressBytes = decoded.slice(1, 21);

    // 3. Validate length
    if (addressBytes.length !== 20) {
      throw new Error('Invalid Tron address length');
    }

    // 4. Left pad with 12 zero bytes to make it 32 bytes
    const paddedBytes = Buffer.concat([
      Buffer.alloc(12, 0), // 12 zero bytes
      addressBytes         // 20-byte address
    ]);

    // 5. Convert to hexadecimal string
    return '0x' + paddedBytes.toString('hex');
  } catch (error: any) {
    throw new Error(`Failed to convert Tron address: ${error.message}`);
  }
}

/**
 * SHA256 hash using Web Crypto API (browser compatible)
 * @param {Uint8Array} data - Data to hash
 * @returns {Promise<Uint8Array>} Hash result
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // Create a new ArrayBuffer from the Uint8Array to ensure proper type
  const buffer = new Uint8Array(data).buffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return new Uint8Array(hashBuffer);
}

/**
 * Converts bytes32 to Tron address
 * @param {string} bytes32Address - Address in bytes32 format
 * @returns {Promise<string>} Tron address in Base58check format
 */
export async function bytes32ToTronAddress(bytes32Address: string): Promise<string> {
  try {
    // Remove '0x' prefix
    const hexString = bytes32Address.startsWith('0x')
      ? bytes32Address.slice(2)
      : bytes32Address;

    // Convert to Buffer
    const buffer = Buffer.from(hexString, 'hex');

    // Take the last 20 bytes (remove the leading 12 zero bytes)
    const addressBytes = buffer.slice(12, 32);

    // Add Tron prefix 0x41
    const addressWithPrefix = Buffer.concat([
      Buffer.from([0x41]),
      addressBytes
    ]);

    // Calculate checksum (first 4 bytes of double SHA256)
    const hash1 = await sha256(new Uint8Array(addressWithPrefix));
    const hash2 = await sha256(hash1);
    const checksum = Buffer.from(hash2.slice(0, 4));

    // Combine: prefix + address + checksum
    const fullAddress = Buffer.concat([addressWithPrefix, checksum]);

    // Base58 encoding
    return bs58.encode(fullAddress);
  } catch (error: any) {
    throw new Error(`Failed to convert bytes32 to Tron address: ${error.message}`);
  }
}

/**
 * Converts Solana address to bytes32 format (for LayerZero OFT)
 * @param {string} solanaAddress - Solana address in Base58 format
 * @returns {string} Address in bytes32 format (starts with 0x, left-padded with zeros)
 */
export function solanaAddressToBytes32(solanaAddress: string) {
  // Decode the Solana address from base58 format
  const decoded = bs58.decode(solanaAddress);

  // Validate length (Solana public key is 32 bytes)
  if (decoded.length !== 32) {
    throw new Error('Invalid Solana address length');
  }

  // Convert to hexadecimal string
  return '0x' + Buffer.from(decoded).toString('hex');
}

/**
 * Converts bytes32 to Solana address
 * @param {string} bytes32Address - Address in bytes32 format
 * @returns {string} Solana address in Base58 format
 */
export function bytes32ToSolanaAddress(bytes32Address: string) {
  const hexString = bytes32Address.startsWith('0x')
    ? bytes32Address.slice(2)
    : bytes32Address;

  const buffer = Buffer.from(hexString, 'hex');

  // Encode as base58
  return bs58.encode(buffer);
}

/**
 * Converts TON address to bytes32 format (for LayerZero OFT)
 * @param {string} tonAddress - TON address in user-friendly (EQ...) or raw (0:hash) format
 * @returns {string} Address in bytes32 format (0x + 32-byte hash as hex)
 */
export function tonAddressToBytes32(tonAddress: string) {
  try {
    const address = Address.parse(tonAddress);
    if (address.hash.length !== 32) {
      throw new Error("Invalid TON address hash length");
    }
    return "0x" + address.hash.toString("hex");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to convert TON address: ${message}`);
  }
}

export function addressToBytes32(chainType: string, address: string) {
  if (chainType === "evm") {
    return zeroPadValue(address, 32);
  }
  if (chainType === "sol") {
    return solanaAddressToBytes32(address);
  }
  if (chainType === "tron") {
    return tronAddressToBytes32(address);
  }
  if (chainType === "ton") {
    return tonAddressToBytes32(address);
  }
  return address;
}
