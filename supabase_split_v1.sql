-- ══════════════════════════════════════
-- SPLIT / GASTOS COMPARTIDOS
-- ══════════════════════════════════════

-- Tabla de grupos
CREATE TABLE public.split_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  participants jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_split_groups_user ON split_groups(user_id);
ALTER TABLE split_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_crud_split_groups" ON split_groups FOR ALL USING (auth.uid() = user_id);

-- Tabla de gastos dentro de un grupo
CREATE TABLE public.split_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  description text NOT NULL,
  amount numeric NOT NULL,
  paid_by text NOT NULL,
  split_mode text NOT NULL DEFAULT 'equal' CHECK (split_mode IN ('equal','custom')),
  split_detail jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_split_expenses_group ON split_expenses(group_id);
ALTER TABLE split_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_crud_split_expenses" ON split_expenses FOR ALL USING (auth.uid() = user_id);
