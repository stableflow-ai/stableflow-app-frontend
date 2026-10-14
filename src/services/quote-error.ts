// Lower level wins when picking which failed route's error to show
export const QuoteErrorLevel = {
  // Reason returned by an API, including mapped ones
  Backend: 0,
  // Reason the frontend recognized itself
  Business: 1,
  // Raw technical error or default copy
  Fallback: 2,
} as const;
export type QuoteErrorLevel = (typeof QuoteErrorLevel)[keyof typeof QuoteErrorLevel];

export const DEFAULT_QUOTE_ERROR_MESSAGE = "Failed to get quote, please try again later";

export class QuoteError extends Error {
  level: QuoteErrorLevel;

  constructor(message: string, level: QuoteErrorLevel) {
    super(message);
    this.name = "QuoteError";
    this.level = level;
  }
}
