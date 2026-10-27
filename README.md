# Medellín Loja V9

Versão corrigida para frontend estático na Vercel e backend Node.js separado no PC/VPS.

- Frontend: raiz do projeto (Vercel)
- Backend: `backend-local/`
- Banco local: `127.0.0.1:3306`, banco `medellin`
- Gemstone: `accounts.Gemstone`
- API Mercado Pago: Orders + PIX
- Webhook: `/api/webhook/mercadopago`

## Trocar link do backend sem redeploy
Abra a loja com `?api=https://SEU-TUNNEL.trycloudflare.com`. A URL fica salva no navegador.
