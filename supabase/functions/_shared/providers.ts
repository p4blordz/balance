export type OAuthTokenPayload = {
  access_token: string;
  refresh_token?: string | null;
  token_type?: string | null;
  expires_in?: number | null;
  scope?: string | null;
  user_id?: string | number | null;
};

export type NormalizedWalletTx = {
  providerTxId: string;
  occurredAt: string;
  description: string;
  amount: number;
  currency: string;
  rawPayload: Record<string, unknown>;
};

const MP_AUTH_URL = "https://auth.mercadopago.com/authorization";
const MP_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
const MP_PAYMENTS_URL = "https://api.mercadopago.com/v1/payments/search";
const MP_USER_ME_URL = "https://api.mercadopago.com/users/me";

export function buildMercadoPagoAuthUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(MP_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeMercadoPagoCode({
  clientId,
  clientSecret,
  redirectUri,
  code,
}: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<OAuthTokenPayload> {
  const response = await fetch(MP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mercado Pago token exchange failed: ${response.status} ${body.slice(0, 160)}`);
  }
  return await response.json();
}

export async function refreshMercadoPagoToken({
  clientId,
  clientSecret,
  refreshToken,
}: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<OAuthTokenPayload> {
  const response = await fetch(MP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mercado Pago token refresh failed: ${response.status} ${body.slice(0, 160)}`);
  }
  return await response.json();
}

function parseResults(payload: unknown): { results: any[]; total: number } {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    const results = Array.isArray(obj.results) ? obj.results : [];
    const paging = (obj.paging && typeof obj.paging === "object") ? obj.paging as Record<string, unknown> : {};
    const total = Number(paging.total || results.length || 0);
    return { results, total };
  }
  return { results: [], total: 0 };
}

function normalizePayment(item: Record<string, any>, ownAccountId?: string | null): NormalizedWalletTx | null {
  const amount = Number(item.transaction_amount ?? item.transaction_details?.total_paid_amount ?? 0);
  const status = String(item.status || "").toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0 || status !== "approved") return null;

  const own = ownAccountId ? String(ownAccountId) : "";
  if (!own) return null;
  const payerId = item.payer?.id != null ? String(item.payer.id) : "";
  const collectorId = item.collector?.id != null ? String(item.collector.id) : "";
  const opType = String(item.operation_type || "").toLowerCase();
  const isOutgoingByPayer = payerId === own && (!collectorId || collectorId !== own);
  const isOutgoingTransfer = opType.includes("money_transfer") && payerId === own && (!collectorId || collectorId !== own);
  const isExpense = isOutgoingByPayer || isOutgoingTransfer;
  if (!isExpense) return null;

  const description = String(
    item.description ||
    item.statement_descriptor ||
    item.reason ||
    item.additional_info?.items?.[0]?.title ||
    item.additional_info?.payer?.first_name ||
    "Gasto Mercado Pago",
  ).slice(0, 240);
  const occurredAt = item.date_approved || item.date_created || new Date().toISOString();
  return {
    providerTxId: String(item.id),
    occurredAt,
    description,
    amount,
    currency: String(item.currency_id || "ARS"),
    rawPayload: item,
  };
}

export async function fetchMercadoPagoUserId({
  accessToken,
}: {
  accessToken: string;
}): Promise<string | null> {
  const response = await fetch(MP_USER_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mercado Pago users/me failed: ${response.status} ${body.slice(0, 180)}`);
  }
  const payload = await response.json();
  const id = payload?.id != null ? String(payload.id) : null;
  return id && id.trim() ? id.trim() : null;
}

function toMercadoPagoRange(dateFrom: string, dateTo: string) {
  // Mercado Pago reporta movimientos en horario local de cuenta; usar -03 evita cortes de fin de dia en AR.
  const begin = `${dateFrom}T00:00:00.000-03:00`;
  const end = `${dateTo}T23:59:59.999-03:00`;
  return { begin, end };
}

export async function fetchMercadoPagoExpenses({
  accessToken,
  dateFrom,
  dateTo,
  ownAccountId,
}: {
  accessToken: string;
  dateFrom: string;
  dateTo: string;
  ownAccountId?: string | null;
}) {
  const { begin, end } = toMercadoPagoRange(dateFrom, dateTo);
  const all: NormalizedWalletTx[] = [];
  let offset = 0;
  const limit = 50;
  while (offset < 4000) {
    const url = new URL(MP_PAYMENTS_URL);
    url.searchParams.set("sort", "date_created");
    url.searchParams.set("criteria", "desc");
    url.searchParams.set("range", "date_created");
    url.searchParams.set("begin_date", begin);
    url.searchParams.set("end_date", end);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Mercado Pago payments search failed: ${response.status} ${body.slice(0, 180)}`);
    }
    const payload = await response.json();
    const { results } = parseResults(payload);
    if (results.length === 0) break;

    results.forEach((item: Record<string, any>) => {
      const normalized = normalizePayment(item, ownAccountId);
      if (normalized) all.push(normalized);
    });

    offset += limit;
    if (results.length < limit) break;
  }

  return all;
}
