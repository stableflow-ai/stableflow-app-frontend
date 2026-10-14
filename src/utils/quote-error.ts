const TEMPORARY_SWAP_LIMIT_PATTERN =
  /temporary swap limits:\s*minimum swap amount is\s*(\$[\d,.]+)/i;

/** Rewrite the Near Intents minimum-amount quote error. Amount is kept from the source text. */
export const formatTemporarySwapLimitMessage = (message: string) => {
  const match = message.match(TEMPORARY_SWAP_LIMIT_PATTERN);
  if (!match) return message;
  return `Temporary swap limits: Minimum swap value is ${match[1]}.`;
};

export const isTemporarySwapLimitError = (message?: string) => {
  return typeof message === "string" && message.startsWith("Temporary swap limits: Minimum swap value is ");
};
