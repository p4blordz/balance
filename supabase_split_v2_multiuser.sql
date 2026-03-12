-- ══════════════════════════════════════
-- SPLIT V2: MULTI-USER / INVITACIONES
-- ══════════════════════════════════════

-- 1. Nueva tabla: miembros de grupo
CREATE TABLE public.split_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  participant_name text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_sgm_group_user ON split_group_members(group_id, user_id);
ALTER TABLE split_group_members ENABLE ROW LEVEL SECURITY;

-- Miembros pueden ver a otros miembros del mismo grupo
CREATE POLICY "member_access" ON split_group_members FOR SELECT
  USING (
    group_id IN (
      SELECT sgm.group_id FROM split_group_members sgm WHERE sgm.user_id = auth.uid()
    )
    OR group_id IN (
      SELECT id FROM split_groups WHERE user_id = auth.uid()
    )
  );

-- Cualquier usuario autenticado puede insertarse (unirse)
CREATE POLICY "member_insert" ON split_group_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Solo el propio usuario puede eliminar su membresía
CREATE POLICY "member_delete" ON split_group_members FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Agregar invite_code a split_groups
ALTER TABLE split_groups ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;

-- 3. Actualizar RLS de split_groups
DROP POLICY IF EXISTS "user_crud_split_groups" ON split_groups;

CREATE POLICY "owner_or_member_select" ON split_groups FOR SELECT
  USING (
    auth.uid() = user_id
    OR id IN (SELECT group_id FROM split_group_members WHERE user_id = auth.uid())
  );

-- Cualquiera puede buscar por invite_code (para unirse)
CREATE POLICY "find_by_invite" ON split_groups FOR SELECT
  USING (invite_code IS NOT NULL);

CREATE POLICY "owner_insert" ON split_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_update" ON split_groups FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_delete" ON split_groups FOR DELETE
  USING (auth.uid() = user_id);

-- Miembros también pueden actualizar (agregar participantes al unirse)
CREATE POLICY "member_update_participants" ON split_groups FOR UPDATE
  USING (
    id IN (SELECT group_id FROM split_group_members WHERE user_id = auth.uid())
  );

-- 4. Actualizar RLS de split_expenses
DROP POLICY IF EXISTS "user_crud_split_expenses" ON split_expenses;

CREATE POLICY "group_member_select" ON split_expenses FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM split_groups WHERE user_id = auth.uid()
      UNION
      SELECT group_id FROM split_group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "group_member_insert" ON split_expenses FOR INSERT
  WITH CHECK (
    group_id IN (
      SELECT id FROM split_groups WHERE user_id = auth.uid()
      UNION
      SELECT group_id FROM split_group_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "group_member_delete" ON split_expenses FOR DELETE
  USING (
    group_id IN (
      SELECT id FROM split_groups WHERE user_id = auth.uid()
      UNION
      SELECT group_id FROM split_group_members WHERE user_id = auth.uid()
    )
  );
