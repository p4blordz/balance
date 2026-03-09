# Deploy de `gastos_app.html`

## 1) Uso en red local (LAN)

Requisito: Python 3 instalado (ya lo tenes en esta PC).

1. Abri PowerShell en esta carpeta:
   `c:\Users\54113\OneDrive\Desktop\gastos app`
2. Ejecuta:
   `.\start_lan.ps1`
3. La app queda disponible en:
   - Local: `http://localhost:8080`
   - Red local: `http://<IP_DE_TU_PC>:8080`

Para ver la IP local:
- Ejecuta `ipconfig`
- Busca la linea `IPv4 Address` del adaptador que estes usando (Wi-Fi o Ethernet).

Notas:
- Todos los dispositivos deben estar en la misma red.
- Si Windows Firewall pregunta, permite acceso a redes privadas.

## 2) Deploy publico (internet)

### Opcion recomendada: Cloudflare Pages

1. Crea una carpeta de deploy con este archivo:
   - `index.html` (copiar desde `gastos_app.html`)
2. Entra a Cloudflare Pages y crea un proyecto `Direct Upload`.
3. Sube la carpeta.
4. Te dara una URL publica tipo:
   `https://<tu-proyecto>.pages.dev`

No hay build step ni dependencias: es sitio estatico.

## 3) Seguridad minima (Supabase)

Como la app usa Supabase en frontend:
- La `anon key` puede ser publica.
- Asegurate de tener RLS activo en `movimientos`.
- Politicas recomendadas: cada usuario solo puede `select/insert/delete` sus propias filas (`user_id = auth.uid()`).

## 4) Integracion Mercado Pago (V1)

Aplicar SQL de billeteras:
- `supabase_wallet_v1.sql`

Deploy de funciones Edge:
- `wallet-connect-start`
- `wallet-connect-callback`
- `wallet-sync`
- `wallet-review-commit`

Variables de entorno en Supabase Functions:
- `APP_BASE_URL`
- `MP_CLIENT_ID`
- `MP_CLIENT_SECRET`
- `MP_REDIRECT_URI` (URL publica de `wallet-connect-callback`)
