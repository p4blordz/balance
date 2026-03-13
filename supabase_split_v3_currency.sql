-- ══════════════════════════════════════
-- SPLIT V3: Soporte multi-moneda + politica UPDATE
-- ══════════════════════════════════════

-- 1. Agregar columna currency a split_expenses (default ARS para datos existentes)
ALTER TABLE public.split_expenses
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

-- 2. Agregar politica UPDATE (faltante en v2_fix — necesaria para editar gastos)
DROP POLICY IF EXISTS "group_member_update" ON split_expenses;
CREATE POLICY "group_member_update" ON split_expenses FOR UPDATE
  USING (
    group_id IN (SELECT id FROM split_groups WHERE user_id = auth.uid())
    OR group_id IN (SELECT get_my_group_ids())
  )
  WITH CHECK (
    group_id IN (SELECT id FROM split_groups WHERE user_id = auth.uid())
    OR group_id IN (SELECT get_my_group_ids())
  );
