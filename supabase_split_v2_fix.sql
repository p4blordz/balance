-- ══════════════════════════════════════
-- FIX: Recursión infinita en políticas RLS
-- ══════════════════════════════════════

-- 1. Función auxiliar SECURITY DEFINER (bypassa RLS para romper recursión)
CREATE OR REPLACE FUNCTION get_my_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT group_id FROM split_group_members WHERE user_id = auth.uid()
$$;

-- 2. Función para buscar grupo por código de invitación (bypassa RLS)
CREATE OR REPLACE FUNCTION find_group_by_invite_code(p_code text)
RETURNS SETOF split_groups
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT * FROM split_groups WHERE invite_code = p_code LIMIT 1
$$;

-- 3. Fix split_group_members: eliminar política recursiva
DROP POLICY IF EXISTS "member_access" ON split_group_members;
CREATE POLICY "member_access" ON split_group_members FOR SELECT
  USING (
    group_id IN (SELECT get_my_group_ids())
    OR group_id IN (SELECT id FROM split_groups WHERE user_id = auth.uid())
  );

-- 4. Fix split_groups: usar función en vez de subquery directa
DROP POLICY IF EXISTS "owner_or_member_select" ON split_groups;
CREATE POLICY "owner_or_member_select" ON split_groups FOR SELECT
  USING (
    auth.uid() = user_id
    OR id IN (SELECT get_my_group_ids())
  );

-- Eliminar find_by_invite (exponía TODOS los grupos a TODOS los usuarios)
DROP POLICY IF EXISTS "find_by_invite" ON split_groups;

-- 5. Fix split_expenses: usar función
DROP POLICY IF EXISTS "group_member_select" ON split_expenses;
CREATE POLICY "group_member_select" ON split_expenses FOR SELECT
  USING (
    group_id IN (SELECT id FROM split_groups WHERE user_id = auth.uid())
    OR group_id IN (SELECT get_my_group_ids())
  );

DROP POLICY IF EXISTS "group_member_insert" ON split_expenses;
CREATE POLICY "group_member_insert" ON split_expenses FOR INSERT
  WITH CHECK (
    group_id IN (SELECT id FROM split_groups WHERE user_id = auth.uid())
    OR group_id IN (SELECT get_my_group_ids())
  );

DROP POLICY IF EXISTS "group_member_delete" ON split_expenses;
CREATE POLICY "group_member_delete" ON split_expenses FOR DELETE
  USING (
    group_id IN (SELECT id FROM split_groups WHERE user_id = auth.uid())
    OR group_id IN (SELECT get_my_group_ids())
  );
