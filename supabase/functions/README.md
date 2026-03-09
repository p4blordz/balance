# Wallet Functions (Mercado Pago)

Funciones Edge incluidas:

- `wallet-connect-start`
- `wallet-connect-callback`
- `wallet-sync`
- `wallet-review-commit`

## Variables de entorno requeridas

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL` (ej: `https://p4blordz.github.io/balance/`)
- `MP_CLIENT_ID`
- `MP_CLIENT_SECRET`
- `MP_REDIRECT_URI` (URL publica de `wallet-connect-callback`)

## Deploy sugerido

```bash
supabase functions deploy wallet-connect-start
supabase functions deploy wallet-connect-callback
supabase functions deploy wallet-sync
supabase functions deploy wallet-review-commit
```

Configurar secrets:

```bash
supabase secrets set APP_BASE_URL=... MP_CLIENT_ID=... MP_CLIENT_SECRET=... MP_REDIRECT_URI=...
```

Aplicar SQL:

```bash
psql < supabase_wallet_v1.sql
```
