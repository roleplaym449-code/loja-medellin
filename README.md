# Medellín Store V8 — PC + Vercel + Mercado Pago PIX Automático

Esta versão foi preparada para o cenário atual do projeto:

- **Frontend público:** `https://loja-medillin.vercel.app/`
- **Backend durante os testes:** seu computador, porta `3000`
- **MariaDB/MySQL durante os testes:** seu computador
- **Banco:** `medellin`
- **Host do banco:** `127.0.0.1`
- **Porta:** `3306`
- **Usuário:** `root`
- **Senha:** vazia no `.env` de teste, conforme a sessão mostrada no HeidiSQL. Se existir senha, preencha antes de iniciar.
- **Webhook:** chega ao seu PC por uma URL HTTPS do Cloudflare Tunnel.
- **Depois:** backend + banco podem ser movidos para a VPS sem alterar a lógica da loja.

## Estrutura confirmada da base Medellín

- `characters.id` = Passaporte
- `characters.Name` + `characters.Lastname` = Nick completo
- `characters.License` = vínculo do personagem com a conta
- `accounts.License` = vínculo da conta
- `accounts.Gemstone` = Diamantes

## Como a compra funciona

1. Jogador abre a loja na Vercel.
2. Escolhe o pacote de diamantes.
3. Informa Passaporte + Nick + e-mail.
4. O frontend chama o backend pelo endereço HTTPS definido em `config.js`.
5. O backend consulta o banco `medellin` no PC.
6. O backend valida Passaporte, Nick e License.
7. O backend cria uma Order PIX no Mercado Pago.
8. A loja mostra QR Code e PIX Copia e Cola.
9. Mercado Pago notifica o backend pelo webhook.
10. O backend consulta a Order novamente no Mercado Pago.
11. Se o pagamento estiver realmente aprovado e o valor estiver correto, soma os diamantes em `accounts.Gemstone`.
12. O pedido fica marcado como entregue para impedir entrega duplicada.

## 1 — Banco de dados

Antes de iniciar, faça backup do banco.

Abra o HeidiSQL e execute `database.sql` no banco `medellin`.

O `.env` já está preparado para:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=medellin
```

Se o usuário `root` tiver senha, coloque-a em `DB_PASSWORD`.

## 2 — Iniciar o backend no seu computador

Instale Node.js 18+ (20/22 recomendado).

Execute:

`INICIAR_LOJA.bat`

O backend ficará em:

`http://127.0.0.1:3000`

Para testar a conexão com o banco, execute:

`TESTAR_BACKEND.bat`

ou abra:

`http://127.0.0.1:3000/api/health`

## 3 — Abrir uma URL HTTPS para o seu computador

O Mercado Pago e a loja da Vercel não podem usar `127.0.0.1` como endereço público.

Instale `cloudflared` no Windows ou coloque `cloudflared.exe` na pasta do projeto.

Depois execute:

`ABRIR_TUNNEL.bat`

Ele mostrará uma URL parecida com:

`https://abc-def.trycloudflare.com`

Mantenha essa janela aberta durante os testes.

## 4 — Colocar a URL do Tunnel no projeto

Copie a URL HTTPS gerada e altere **dois lugares**.

### `config.js`

```js
window.MEDELLIN_CONFIG = Object.freeze({
  API_BASE_URL: 'https://abc-def.trycloudflare.com'
});
```

Esse arquivo é usado pelo frontend hospedado na Vercel para encontrar o backend no seu PC.

### `.env`

```env
PUBLIC_BASE_URL=https://abc-def.trycloudflare.com
```

O `.env` também já permite chamadas originadas da sua loja:

```env
ALLOWED_ORIGINS=https://loja-medillin.vercel.app,http://127.0.0.1:3000,http://localhost:3000
```

## 5 — Atualizar a Vercel

Publique pelo menos estes arquivos atualizados no projeto da Vercel:

- `index.html`
- `styles.css`
- `script.js`
- `config.js`
- pasta `assets`

**Não publique `.env`, `server.js` ou credenciais na Vercel como arquivos públicos.** O Access Token do Mercado Pago deve continuar somente no backend.

## 6 — Webhook do Mercado Pago

Na aplicação `Medellin Loja PIX`, configure o webhook de Order para:

`https://SUA-URL-DO-TUNNEL.trycloudflare.com/api/webhook/mercadopago`

Depois de salvar, copie a Assinatura Secreta gerada pelo Mercado Pago para:

```env
MP_WEBHOOK_SECRET=SUA_ASSINATURA_SECRETA
```

Reinicie `INICIAR_LOJA.bat` depois de alterar o `.env`.

## 7 — Teste recomendado

Use um personagem de teste e o menor pacote primeiro.

1. Confira o valor atual de `accounts.Gemstone` no HeidiSQL.
2. Gere o PIX pela loja.
3. Faça o teste de pagamento apropriado no Mercado Pago.
4. Aguarde a confirmação.
5. Atualize a linha no HeidiSQL.
6. A quantidade deve ser somada uma única vez.

## Quando mover para a VPS

Você não precisa refazer a loja. Troque somente:

- dados `DB_*` se o banco mudar;
- `PUBLIC_BASE_URL` para a URL fixa do backend;
- `config.js -> API_BASE_URL` para a mesma URL fixa;
- URL do Webhook no Mercado Pago.

Quando tudo estiver na mesma VPS/domínio, também podemos configurar um proxy para o frontend usar `/api` sem depender do Tunnel.

## Segurança

O Access Token atualmente usado no teste apareceu anteriormente em uma captura de tela. Depois que a integração estiver funcionando, regenere/revogue essa credencial no Mercado Pago e substitua somente `MP_ACCESS_TOKEN` no `.env`.
