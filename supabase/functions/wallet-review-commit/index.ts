import { corsHeaders, errorResponse, getServiceClient, getUserOrThrow, json, monthYearFromIso } from "../_shared/common.ts";

type ReviewItem = {
  wallet_tx_id: string;
  category_id?: string | null;
  action?: string | null;
  description?: string | null;
};

function normalizeAction(value?: string | null) {
  const action = String(value || "").toLowerCase();
  return action === "skip" ? "skip" : "approve";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const user = await getUserOrThrow(req);
    const admin = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return json({ imported: 0, skipped: 0 });

    const items = rawItems
      .map((x: ReviewItem) => ({
        wallet_tx_id: String(x.wallet_tx_id || ""),
        category_id: x.category_id ? String(x.category_id) : null,
        action: normalizeAction(x.action),
        description: x.description ? String(x.description).trim() : "",
      }))
      .filter(x => x.wallet_tx_id);

    if (items.length === 0) return json({ imported: 0, skipped: 0 });

    const txIds = [...new Set(items.map(x => x.wallet_tx_id))];
    const itemMap = new Map(items.map(x => [x.wallet_tx_id, x]));

    const { data: rows, error: rowsError } = await admin
      .from("wallet_transactions")
      .select("id,user_id,description,amount,occurred_at,review_status,suggested_cat,selected_cat")
      .eq("user_id", user.id)
      .in("id", txIds);
    if (rowsError) throw rowsError;

    const toImport = [];
    const toSkip = [];

    for (const row of (rows || [])) {
      const selection = itemMap.get(row.id);
      if (!selection) continue;
      if (selection.action === "skip") {
        toSkip.push({ id: row.id, selected_cat: selection.category_id || row.selected_cat || row.suggested_cat || null });
        continue;
      }
      const amount = Math.abs(Number(row.amount) || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        toSkip.push({ id: row.id, selected_cat: selection.category_id || row.selected_cat || row.suggested_cat || null });
        continue;
      }
      const category = selection.category_id || row.selected_cat || row.suggested_cat || "varios";
      const period = monthYearFromIso(row.occurred_at);
      const finalDescription = selection.description || row.description || "Gasto Mercado Pago";
      toImport.push({
        tx_id: row.id,
        category,
        description: finalDescription,
        movement: {
          user_id: user.id,
          type: "gasto",
          cat: category,
          desc: finalDescription,
          monto: amount,
          mes: period.mes,
          anio: period.anio,
          created: period.created,
        },
      });
    }

    let insertedRows: Array<{ id: string }> = [];
    if (toImport.length > 0) {
      const { data: inserted, error: insertError } = await admin
        .from("movimientos")
        .insert(toImport.map(x => x.movement))
        .select("id");
      if (insertError) throw insertError;
      insertedRows = inserted || [];
    }

    for (let i = 0; i < toImport.length; i += 1) {
      const tx = toImport[i];
      const movement = insertedRows[i];
      await admin
        .from("wallet_transactions")
        .update({
          review_status: "imported",
          selected_cat: tx.category,
          movement_id: movement ? movement.id : null,
          imported_at: new Date().toISOString(),
        })
        .eq("id", tx.tx_id)
        .eq("user_id", user.id);
    }

    for (const tx of toSkip) {
      await admin
        .from("wallet_transactions")
        .update({
          review_status: "skipped",
          selected_cat: tx.selected_cat,
        })
        .eq("id", tx.id)
        .eq("user_id", user.id);
    }

    return json({
      imported: toImport.length,
      skipped: toSkip.length,
    });
  } catch (e) {
    return errorResponse(e, 400);
  }
});
