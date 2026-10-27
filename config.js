// Medellín Store — configuração do frontend
// DURANTE OS TESTES NO PC:
// 1) Abra o Cloudflare Tunnel para http://127.0.0.1:3000
// 2) Copie a URL HTTPS gerada (ex.: https://abc.trycloudflare.com)
// 3) Cole abaixo e publique este arquivo junto com a loja na Vercel.
//
// QUANDO MOVER PARA A VPS:
// troque apenas esta URL pelo endereço HTTPS fixo do backend.
window.MEDELLIN_CONFIG = Object.freeze({
  API_BASE_URL: 'https://COLE-AQUI-SEU-TUNNEL.trycloudflare.com'
});
