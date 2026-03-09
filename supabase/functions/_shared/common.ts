import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export function getServiceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getUserClient(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
}

export async function getUserOrThrow(req: Request) {
  const client = getUserClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function toDateRangeISO(dateFrom: string, dateTo: string) {
  const begin = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T23:59:59.999Z`);
  if (Number.isNaN(begin.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid date range");
  }
  return { begin: begin.toISOString(), end: end.toISOString() };
}

export function monthYearFromIso(isoValue?: string | null) {
  const dt = isoValue ? new Date(isoValue) : new Date();
  const safe = Number.isNaN(dt.getTime()) ? new Date() : dt;
  return {
    mes: MONTHS_ES[safe.getUTCMonth()],
    anio: safe.getUTCFullYear(),
    created: safe.toISOString(),
  };
}

export function normalizeToken(value: string) {
  let text = String(value || "").toLowerCase();
  if (typeof text.normalize === "function") {
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  return text.replace(/[^a-z0-9]/g, "");
}

export function suggestCategory(description?: string | null) {
  const token = normalizeToken(description || "");
  if (!token) return "varios";
  if (token.includes("nafta") || token.includes("uber") || token.includes("taxi") || token.includes("peaje") || token.includes("colectivo") || token.includes("sube")) return "moto";
  if (token.includes("super") || token.includes("mercado") || token.includes("kiosco") || token.includes("carniceria") || token.includes("verduleria") || token.includes("almacen") || token.includes("panaderia")) return "alimentos";
  if (token.includes("impuesto") || token.includes("afip") || token.includes("luz") || token.includes("agua") || token.includes("internet") || token.includes("gas")) return "impuestos";
  if (token.includes("alquiler") || token.includes("expensa") || token.includes("hogar") || token.includes("ferreteria")) return "casa";
  if (token.includes("cine") || token.includes("bar") || token.includes("resto") || token.includes("salida") || token.includes("entrada")) return "salidas";
  return "varios";
}

export function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return json({ error: message }, status);
}

export function redirectWithParams(baseUrl: string, params: Record<string, string>) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return Response.redirect(url.toString(), 302);
}
