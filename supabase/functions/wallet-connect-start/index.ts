import { buildMercadoPagoAuthUrl } from "../_shared/providers.ts";
import { corsHeaders, env, errorResponse, getServiceClient, getUserOrThrow, json } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const user = await getUserOrThrow(req);
    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider || "").toLowerCase();
    if (provider !== "mercadopago") throw new Error("Unsupported provider");

    const redirectTo = typeof body.redirect_to === "string" && body.redirect_to
      ? body.redirect_to
      : env("APP_BASE_URL");

    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const admin = getServiceClient();
    const { error } = await admin
      .schema("private")
      .from("wallet_oauth_states")
      .insert({
        state,
        user_id: user.id,
        provider,
        redirect_to: redirectTo,
        expires_at: expiresAt,
      });
    if (error) throw error;

    const redirectUri = env("MP_REDIRECT_URI");
    const authUrl = buildMercadoPagoAuthUrl({
      clientId: env("MP_CLIENT_ID"),
      redirectUri,
      state,
    });

    return json({ redirect_url: authUrl });
  } catch (e) {
    return errorResponse(e, 400);
  }
});
