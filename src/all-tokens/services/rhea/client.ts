import { RHEA_API_URL, RHEA_CCD_API_ACCESS_TOKEN } from "@/config/api";

export type RheaEnvelope<T> = {
  code: number;
  msg: string;
  data: T;
};

export class RheaApiError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "RheaApiError";
    this.code = code;
  }
}

export async function rheaFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };

  if (RHEA_CCD_API_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${RHEA_CCD_API_ACCESS_TOKEN}`;
  }

  const response = await fetch(`${RHEA_API_URL}${path}`, {
    ...init,
    headers,
  });

  const body = (await response.json()) as RheaEnvelope<T> | T;

  if (!response.ok) {
    const msg =
      body && typeof body === "object" && "msg" in body
        ? String((body as RheaEnvelope<T>).msg)
        : `HTTP ${response.status}`;
    throw new RheaApiError(msg, response.status);
  }

  if (body && typeof body === "object" && "code" in body) {
    const envelope = body as RheaEnvelope<T>;
    if (envelope.code !== 0) {
      throw new RheaApiError(envelope.msg || `API code ${envelope.code}`, envelope.code);
    }
    return envelope.data;
  }

  return body as T;
}

export async function rheaSwapApi<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  return rheaFetch<T>(path.startsWith("/api/") ? path : `/api/swap${path}`, init);
}
