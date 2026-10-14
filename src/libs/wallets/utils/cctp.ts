import { BASE_API_URL } from "@/config/api";
import { DEFAULT_QUOTE_ERROR_MESSAGE, QuoteError, QuoteErrorLevel } from "@/services/quote-error";
import axios from "axios";

export async function quoteSignature(data?: any) {
  const response = await axios.post(`${BASE_API_URL}/v1/cctp/sign`, data);
  if (response.status !== 200 || response.data.code !== 200) {
    if (!response.data?.message) {
      throw new QuoteError(DEFAULT_QUOTE_ERROR_MESSAGE, QuoteErrorLevel.Fallback);
    }
    throw new QuoteError(response.data.message, QuoteErrorLevel.Backend);
  }
  return response.data.data;
}
