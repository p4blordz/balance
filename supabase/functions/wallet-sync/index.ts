import { fetchMercadoPagoExpenses, refreshMercadoPagoToken } from "../_shared/providers.ts";
import { corsHeaders, env, errorResponse, getServiceClient, getUserOrThrow, json, suggestCategory } from "../_shared/common.ts";

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function refreshTokenIfNeeded({
  admin,
  connectionId,
  tokenRow,
}: {
  admin: ReturnType<typeof getServiceClient>;
  connectionId: string;
  tokenRow: { access_token: string; refresh_token: string | null; expires_at: string | null };
}) {
  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0;
  const shouldRefresh = !!tokenRow.refresh_token && (!expiresAt || expiresAt < Date.now() + 90 * 1000);
  if (!shouldRefresh) {
    return {
      accessToken: tokenRow.access_token,
      refreshToken: tokenRow.refresh_token,
      expiresAt: tokenRow.expires_at,
    };
  }

  const refreshed = await refreshMercadoPagoToken({
    clientId: env("MP_CLIENT_ID"),
    clientSecret: env("MP_CLIENT_SECRET"),
    refreshToken: tokenRow.refresh_token || "",
  });

  const nextExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
    : null;

  await admin.schema("private").from("wallet_connection_tokens").update({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || tokenRow.refresh_token,
    token_type: refreshed.token_type || null,
    scope: refreshed.scope || null,
    expires_at: nextExpiresAt,
  }).eq("connection_id", connectionId);

  await admin.from("wallet_connections").update({
    status: "connected",
    token_expires_at: nextExpiresAt,
  }).eq("id", connectionId);

  return {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokenRow.refresh_token,
    expiresAt: nextExpiresAt,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const admin = getServiceClient();
  let runContext: { userId: string; connectionId: string | null; dateFrom: string | null; dateTo: string | null } = {
    userId: "",
    connectionId: null,
    dateFrom: null,
    dateTo: null,
  };

  try {
    const user = await getUserOrThrow(req);
    const body = await req.json().catch(() => ({}));
    const connectionId = String(body.connection_id || "");
    const dateFrom = String(body.date_from || "");
    const dateTo = String(body.date_to || "");
    if (!connectionId) throw new Error("connection_id is required");
    if (!validDate(dateFrom) || !validDate(dateTo)) throw new Error("date_from/date_to must use YYYY-MM-DD");
    if (dateFrom > dateTo) throw new Error("date_from must be <= date_to");
    runContext = { userId: user.id, connectionId, dateFrom, dateTo };

    const { data: connection, error: connError } = await admin
      .from("wallet_connections")
      .select("id,user_id,provider,provider_account_id,status")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .eq("provider", "mercadopago")
      .maybeSingle();
    if (connError) throw connError;
    if (!connection) throw new Error("Connection not found");
    if (connection.status !== "connected") throw new Error("Connection is not active");

    const { data: tokenRow, error: tokenError } = await admin
      .schema("private")
      .from("wallet_connection_tokens")
      .select("access_token,refresh_token,expires_at")
      .eq("connection_id", connectionId)
      .maybeSingle();
    if (tokenError) throw tokenError;
    if (!tokenRow) throw new Error("Connection token not found");

    const token = await refreshTokenIfNeeded({ admin, connectionId, tokenRow });
    const expenses = await fetchMercadoPagoExpenses({
      accessToken: token.accessToken,
      dateFrom,
      dateTo,
      ownAccountId: connection.provider_account_id,
    });

    const rows = expenses.map((tx) => ({
      user_id: user.id,
      connection_id: connectionId,
      provider: "mercadopago",
      provider_tx_id: tx.providerTxId,
      occurred_at: tx.occurredAt,
      description: tx.description,
      amount: tx.amount,
      currency: tx.currency || "ARS",
      raw_payload: tx.rawPayload,
      suggested_cat: suggestCategory(tx.description),
      selected_cat: null,
      review_status: "pending",
    }));

    let duplicated = 0;
    if (rows.length > 0) {
      const { data: upserted, error: upsertError } = await admin
        .from("wallet_transactions")
        .upsert(rows, {
          onConflict: "user_id,provider,provider_tx_id",
          ignoreDuplicates: true,
        })
        .select("id");
      if (upsertError) throw upsertError;
      duplicated = Math.max(0, rows.length - ((upserted || []).length));
    }

    const { count: pendingCount } = await admin
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("connection_id", connectionId)
      .in("review_status", ["pending", "approved"]);

    await admin.from("wallet_sync_runs").insert({
      user_id: user.id,
      connection_id: connectionId,
      provider: "mercadopago",
      date_from: dateFrom,
      date_to: dateTo,
      fetched_count: rows.length,
      pending_count: pendingCount || 0,
      duplicated_count: duplicated,
      status: "ok",
    });

    return json({
      fetched: rows.length,
      pending: pendingCount || 0,
      duplicated,
    });
  } catch (e) {
    if (runContext.userId) {
      await admin.from("wallet_sync_runs").insert({
        user_id: runContext.userId,
        connection_id: runContext.connectionId,
        provider: "mercadopago",
        date_from: runContext.dateFrom,
        date_to: runContext.dateTo,
        fetched_count: 0,
        pending_count: 0,
        duplicated_count: 0,
        status: "error",
        error_message: (e instanceof Error ? e.message : String(e)).slice(0, 320),
      });
    }
    return errorResponse(e, 400);
  }
});
