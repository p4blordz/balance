import { exchangeMercadoPagoCode } from "../_shared/providers.ts";
import { env, errorResponse, getServiceClient, redirectWithParams } from "../_shared/common.ts";

function safeRedirect(base: string, params: Record<string, string>) {
  try {
    return redirectWithParams(base, params);
  } catch {
    return new Response("Invalid redirect URL", { status: 400 });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  const url = new URL(req.url);
  const oauthError = url.searchParams.get("error");
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const fallbackApp = env("APP_BASE_URL");

  const admin = getServiceClient();
  let redirectTo = fallbackApp;

  try {
    if (!state) throw new Error("Missing OAuth state");

    const { data: stateRow, error: stateError } = await admin
      .schema("private")
      .from("wallet_oauth_states")
      .select("state,user_id,provider,redirect_to,expires_at,consumed_at")
      .eq("state", state)
      .maybeSingle();
    if (stateError) throw stateError;
    if (!stateRow) throw new Error("OAuth state not found");
    if (stateRow.redirect_to) redirectTo = stateRow.redirect_to;
    if (stateRow.consumed_at) throw new Error("OAuth state already consumed");
    if (new Date(stateRow.expires_at).getTime() < Date.now()) throw new Error("OAuth state expired");

    if (oauthError) throw new Error(`Mercado Pago OAuth error: ${oauthError}`);
    if (!code) throw new Error("Missing authorization code");

    const token = await exchangeMercadoPagoCode({
      clientId: env("MP_CLIENT_ID"),
      clientSecret: env("MP_CLIENT_SECRET"),
      redirectUri: env("MP_REDIRECT_URI"),
      code,
    });

    const providerAccountId = token.user_id != null ? String(token.user_id) : null;
    const expiresAt = token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null;

    const { data: connection, error: connError } = await admin
      .from("wallet_connections")
      .upsert({
        user_id: stateRow.user_id,
        provider: "mercadopago",
        provider_account_id: providerAccountId,
        status: "connected",
        token_expires_at: expiresAt,
      }, { onConflict: "user_id,provider,provider_account_id" })
      .select("id")
      .single();
    if (connError || !connection) throw connError || new Error("Unable to create wallet connection");

    const { error: tokenError } = await admin
      .schema("private")
      .from("wallet_connection_tokens")
      .upsert({
        connection_id: connection.id,
        access_token: token.access_token,
        refresh_token: token.refresh_token || null,
        token_type: token.token_type || null,
        scope: token.scope || null,
        expires_at: expiresAt,
      }, { onConflict: "connection_id" });
    if (tokenError) throw tokenError;

    await admin
      .schema("private")
      .from("wallet_oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("state", state);

    return safeRedirect(redirectTo, {
      wallet_status: "connected",
      wallet_provider: "mercadopago",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return safeRedirect(redirectTo, {
      wallet_status: "error",
      wallet_message: message.slice(0, 180),
      wallet_provider: "mercadopago",
    });
  }
});
