require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(v => v.trim().replace(/\/$/, ''))
  .filter(Boolean);

// Permite que o frontend hospedado na Vercel converse com este backend local/VPS.
// Somente as origens explicitamente configuradas no .env recebem CORS.
app.use((req, res, next) => {
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '256kb' }));
app.use(express.static(__dirname));

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || '';
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

const PRODUCTS = Object.freeze({
  d200: { name: '200 Diamantes', diamonds: 200, amount: 1 },
  d1000: { name: '1.000 Diamantes', diamonds: 1000, amount: 5 },
  d5000: { name: '5.000 Diamantes', diamonds: 5000, amount: 25 },
  d10000: { name: '10.000 Diamantes', diamonds: 10000, amount: 50 },
  d30000: { name: '30.000 Diamantes', diamonds: 30000, amount: 150 },
  d50000: { name: '50.000 Diamantes', diamonds: 50000, amount: 250 },
  d100000: { name: '100.000 Diamantes', diamonds: 100000, amount: 500 },
  d300000: { name: '300.000 Diamantes', diamonds: 300000, amount: 1500 }
});

function identifier(value, label) {
  if (!/^[A-Za-z0-9_]+$/.test(value || '')) throw new Error(`${label} inválido no .env`);
  return `\`${value}\``;
}

// Estrutura confirmada da base Medellín:
// characters.id = passaporte
// characters.Name + characters.Lastname = nick
// characters.License -> accounts.License
// accounts.Gemstone = diamantes
const CHAR_TABLE = identifier(process.env.DB_CHARACTER_TABLE || 'characters', 'DB_CHARACTER_TABLE');
const CHAR_PASS_COL = identifier(process.env.DB_CHARACTER_PASSPORT_COLUMN || 'id', 'DB_CHARACTER_PASSPORT_COLUMN');
const CHAR_NAME_COL = identifier(process.env.DB_CHARACTER_NAME_COLUMN || 'Name', 'DB_CHARACTER_NAME_COLUMN');
const CHAR_LASTNAME_COL = identifier(process.env.DB_CHARACTER_LASTNAME_COLUMN || 'Lastname', 'DB_CHARACTER_LASTNAME_COLUMN');
const CHAR_LICENSE_COL = identifier(process.env.DB_CHARACTER_LICENSE_COLUMN || 'License', 'DB_CHARACTER_LICENSE_COLUMN');
const ACCOUNT_TABLE = identifier(process.env.DB_ACCOUNT_TABLE || 'accounts', 'DB_ACCOUNT_TABLE');
const ACCOUNT_LICENSE_COL = identifier(process.env.DB_ACCOUNT_LICENSE_COLUMN || 'License', 'DB_ACCOUNT_LICENSE_COLUMN');
const ACCOUNT_GEMSTONE_COL = identifier(process.env.DB_ACCOUNT_GEMSTONE_COLUMN || 'Gemstone', 'DB_ACCOUNT_GEMSTONE_COLUMN');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

async function mpRequest(url, options = {}) {
  if (!MP_ACCESS_TOKEN || MP_ACCESS_TOKEN.includes('SEU_ACCESS_TOKEN')) {
    throw new Error('MP_ACCESS_TOKEN ainda não foi configurado no arquivo .env');
  }
  const res = await fetch(`https://api.mercadopago.com${url}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || body.error || `Mercado Pago retornou HTTP ${res.status}`);
    err.details = body;
    throw err;
  }
  return body;
}


function verifyMercadoPagoWebhook(req) {
  // Se a assinatura secreta ainda não foi configurada, mantemos a segunda
  // barreira de segurança: a entrega só ocorre após consultar a Order na API.
  // Assim que você salvar o Webhook no painel, preencha MP_WEBHOOK_SECRET.
  if (!MP_WEBHOOK_SECRET || MP_WEBHOOK_SECRET.includes('COLE_AQUI')) {
    return { ok: true, skipped: true };
  }

  const xSignature = String(req.headers['x-signature'] || '');
  const xRequestId = String(req.headers['x-request-id'] || '');
  const dataIdRaw = String(req.query?.['data.id'] || req.query?.data_id || req.body?.data?.id || '');
  if (!xSignature || !xRequestId || !dataIdRaw) {
    return { ok: false, reason: 'Cabeçalhos/parâmetros de assinatura ausentes.' };
  }

  const parts = Object.fromEntries(
    xSignature.split(',').map(part => {
      const i = part.indexOf('=');
      return i > 0 ? [part.slice(0, i).trim(), part.slice(i + 1).trim()] : ['', ''];
    }).filter(([k]) => k)
  );
  const ts = parts.ts;
  const received = parts.v1;
  if (!ts || !received) return { ok: false, reason: 'x-signature inválido.' };

  // Para Orders, o Mercado Pago orienta usar data.id em minúsculas no manifest.
  const dataId = dataIdRaw.toLowerCase();
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', MP_WEBHOOK_SECRET).update(manifest).digest('hex');

  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(received, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: 'Assinatura do webhook não confere.' };
    }
  } catch {
    return { ok: false, reason: 'Assinatura do webhook inválida.' };
  }

  return { ok: true, skipped: false };
}

function validPassport(v) { return /^\d{1,12}$/.test(String(v || '').trim()); }
function validNick(v) { return String(v || '').trim().length >= 2 && String(v || '').trim().length <= 100; }
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
function normalizeNick(v) { return String(v || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'); }

async function findPlayer(passport, nick) {
  const sql = `
    SELECT
      c.${CHAR_PASS_COL} AS passport,
      c.${CHAR_NAME_COL} AS first_name,
      c.${CHAR_LASTNAME_COL} AS last_name,
      c.${CHAR_LICENSE_COL} AS license,
      a.${ACCOUNT_LICENSE_COL} AS account_license
    FROM ${CHAR_TABLE} c
    LEFT JOIN ${ACCOUNT_TABLE} a ON a.${ACCOUNT_LICENSE_COL} = c.${CHAR_LICENSE_COL}
    WHERE c.${CHAR_PASS_COL} = ?
    LIMIT 1
  `;
  const [rows] = await pool.execute(sql, [passport]);
  if (!rows.length) return { ok: false, reason: 'Passaporte não encontrado na cidade.' };

  const row = rows[0];
  const fullNick = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  if (normalizeNick(fullNick) !== normalizeNick(nick)) {
    return { ok: false, reason: `O nick não confere com esse passaporte. Use exatamente: ${fullNick}` };
  }
  if (!row.license) return { ok: false, reason: 'Esse personagem não possui License vinculada.' };
  if (!row.account_license) return { ok: false, reason: 'A conta desse personagem não foi encontrada em accounts.' };

  return {
    ok: true,
    passport: String(row.passport),
    nick: fullNick,
    license: String(row.license)
  };
}

async function deliverOrder(orderId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orders] = await conn.execute(
      'SELECT * FROM medellin_store_orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    if (!orders.length) throw new Error('Pedido não encontrado.');

    const order = orders[0];
    if (order.delivered) {
      await conn.commit();
      return { delivered: true, already: true };
    }
    if (order.status !== 'approved') throw new Error('Pagamento ainda não está aprovado.');

    // A entrega usa a License salva no momento da compra e ainda confirma
    // que o passaporte continua vinculado à mesma License.
    const update = `
      UPDATE ${ACCOUNT_TABLE} a
      INNER JOIN ${CHAR_TABLE} c
        ON c.${CHAR_LICENSE_COL} = a.${ACCOUNT_LICENSE_COL}
      SET a.${ACCOUNT_GEMSTONE_COL} = COALESCE(a.${ACCOUNT_GEMSTONE_COL}, 0) + ?
      WHERE c.${CHAR_PASS_COL} = ?
        AND c.${CHAR_LICENSE_COL} = ?
        AND a.${ACCOUNT_LICENSE_COL} = ?
      LIMIT 1
    `;
    const [result] = await conn.execute(update, [
      Number(order.diamonds),
      order.passport,
      order.license,
      order.license
    ]);

    if (result.affectedRows !== 1) {
      throw new Error('Não foi possível entregar os diamantes. Passaporte/License não conferem com accounts.');
    }

    await conn.execute(
      'UPDATE medellin_store_orders SET delivered = 1, delivered_at = NOW() WHERE id = ?',
      [order.id]
    );

    await conn.commit();
    return { delivered: true, already: false };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function syncMercadoPagoOrder(mpOrderId) {
  const mpOrder = await mpRequest(`/v1/orders/${encodeURIComponent(mpOrderId)}`);
  const localOrderId = mpOrder.external_reference;
  if (!localOrderId) return null;

  const [rows] = await pool.execute(
    'SELECT * FROM medellin_store_orders WHERE id = ? LIMIT 1',
    [localOrderId]
  );
  if (!rows.length) return null;
  const order = rows[0];

  const totalAmount = Number(mpOrder.total_amount || 0);
  const totalPaid = Number(mpOrder.total_paid_amount || 0);
  const payment = mpOrder.transactions?.payments?.[0] || null;
  const paymentAmount = Number(payment?.amount || 0);

  const amountOk = totalAmount.toFixed(2) === Number(order.amount).toFixed(2)
    && paymentAmount.toFixed(2) === Number(order.amount).toFixed(2);
  const idOk = !order.mp_order_id || String(order.mp_order_id) === String(mpOrder.id);
  if (!amountOk || !idOk) throw new Error('Falha de segurança: order do Mercado Pago não corresponde ao pedido.');

  const mpStatus = String(mpOrder.status || 'processing');
  const paymentStatus = String(payment?.status || 'processing');
  const paidOk = mpStatus === 'processed'
    && paymentStatus === 'processed'
    && totalPaid.toFixed(2) === Number(order.amount).toFixed(2);

  const localStatus = paidOk ? 'approved' : mpStatus;
  await pool.execute(
    'UPDATE medellin_store_orders SET mp_order_id = ?, mp_payment_id = ?, status = ? WHERE id = ?',
    [String(mpOrder.id), payment?.id ? String(payment.id) : null, localStatus, localOrderId]
  );

  if (paidOk) await deliverOrder(localOrderId);
  return { orderId: localOrderId, status: localStatus, mpStatus, paymentStatus };
}

app.post('/api/pix', async (req, res) => {
  try {
    const { items, passport, nick, email } = req.body || {};
    const productIds = Array.isArray(items) ? items : [];
    if (!productIds.length || productIds.length > 20) return res.status(400).json({ error: 'Carrinho inválido.' });

    const selected = productIds.map(id => PRODUCTS[id]);
    if (selected.some(p => !p)) return res.status(400).json({ error: 'Existe um pacote inválido no carrinho.' });

    const product = {
      name: selected.length === 1 ? selected[0].name : `${selected.reduce((s, p) => s + p.diamonds, 0).toLocaleString('pt-BR')} Diamantes`,
      diamonds: selected.reduce((s, p) => s + p.diamonds, 0),
      amount: selected.reduce((s, p) => s + p.amount, 0)
    };

    if (!validPassport(passport)) return res.status(400).json({ error: 'Informe um passaporte numérico válido.' });
    if (!validNick(nick)) return res.status(400).json({ error: 'Informe seu nick completo do jogo.' });
    if (!validEmail(email)) return res.status(400).json({ error: 'Informe um e-mail válido para o pagamento.' });

    const player = await findPlayer(String(passport).trim(), String(nick).trim());
    if (!player.ok) return res.status(404).json({ error: player.reason });

    const orderId = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO medellin_store_orders
       (id, passport, nick, license, email, diamonds, amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'created')`,
      [orderId, player.passport, player.nick, player.license, String(email).trim(), product.diamonds, product.amount]
    );

    const amount = Number(product.amount).toFixed(2);
    const payload = {
      type: 'online',
      total_amount: amount,
      external_reference: orderId,
      processing_mode: 'automatic',
      transactions: {
        payments: [
          {
            amount,
            payment_method: {
              id: 'pix',
              type: 'bank_transfer'
            }
          }
        ]
      },
      payer: { email: String(email).trim() }
    };

    let mpOrder;
    try {
      mpOrder = await mpRequest('/v1/orders', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': orderId },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      await pool.execute("UPDATE medellin_store_orders SET status='error' WHERE id = ?", [orderId]);
      throw e;
    }

    const payment = mpOrder.transactions?.payments?.[0] || {};
    const method = payment.payment_method || {};
    await pool.execute(
      'UPDATE medellin_store_orders SET mp_order_id = ?, mp_payment_id = ?, status = ? WHERE id = ?',
      [String(mpOrder.id), payment.id ? String(payment.id) : null, String(mpOrder.status || 'action_required'), orderId]
    );

    return res.json({
      orderId,
      mercadoPagoOrderId: mpOrder.id,
      paymentId: payment.id || null,
      status: mpOrder.status,
      diamonds: product.diamonds,
      amount: product.amount,
      qrCode: method.qr_code || null,
      qrCodeBase64: method.qr_code_base64 || null,
      ticketUrl: method.ticket_url || null
    });
  } catch (e) {
    console.error('[PIX/ORDERS]', e.message, e.details || '');
    res.status(500).json({ error: e.message || 'Erro ao gerar Pix.' });
  }
});

app.post('/api/webhook/mercadopago', async (req, res) => {
  try {
    const type = String(req.body?.type || req.query?.type || '');
    const mpOrderId = req.query?.['data.id'] || req.query?.data_id || req.body?.data?.id;

    if (type && !['order', 'orders_v2'].includes(type)) return res.sendStatus(200);
    if (!mpOrderId) return res.sendStatus(200);

    const signature = verifyMercadoPagoWebhook(req);
    if (!signature.ok) {
      console.warn('[WEBHOOK/ASSINATURA]', signature.reason);
      return res.sendStatus(401);
    }

    // Resposta rápida conforme recomendado pelo Mercado Pago. A entrega só
    // ocorre após uma consulta autenticada GET /v1/orders/{id} e validação
    // do status, valor, referência e idempotência no banco.
    res.sendStatus(200);

    try {
      const result = await syncMercadoPagoOrder(String(mpOrderId));
      if (result) console.log('[WEBHOOK/ORDER]', result);
    } catch (e) {
      console.error('[WEBHOOK/ORDER]', e.message);
    }
  } catch (e) {
    console.error('[WEBHOOK]', e.message);
    if (!res.headersSent) res.sendStatus(500);
  }
});

app.get('/api/orders/:id/status', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, mp_order_id, status, delivered, diamonds, passport, nick FROM medellin_store_orders WHERE id = ? LIMIT 1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado.' });

    let order = rows[0];
    if (!order.delivered && order.mp_order_id && ['created', 'processing', 'action_required', 'pending', 'in_process'].includes(order.status)) {
      try { await syncMercadoPagoOrder(order.mp_order_id); } catch (_) {}
      const [fresh] = await pool.execute(
        'SELECT id, status, delivered, diamonds, passport, nick FROM medellin_store_orders WHERE id = ? LIMIT 1',
        [req.params.id]
      );
      order = fresh[0];
    }

    res.json({
      orderId: order.id,
      status: order.status,
      delivered: Boolean(order.delivered),
      diamonds: order.diamonds,
      passport: order.passport,
      nick: order.nick
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao consultar pedido.' });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, mercadoPagoConfigured: Boolean(MP_ACCESS_TOKEN), mercadoPagoApi: 'Orders', webhookSecretConfigured: Boolean(MP_WEBHOOK_SECRET && !MP_WEBHOOK_SECRET.includes('COLE_AQUI')), publicBaseUrlConfigured: Boolean(PUBLIC_BASE_URL && !PUBLIC_BASE_URL.includes('COLE-AQUI') && !PUBLIC_BASE_URL.includes('seudominio')), allowedOrigins: ALLOWED_ORIGINS });
  } catch {
    res.status(500).json({ ok: false });
  }
});

app.listen(PORT, () => {
  console.log(`Medellín Store V7 Automática rodando na porta ${PORT}`);
  if (!PUBLIC_BASE_URL || PUBLIC_BASE_URL.includes('COLE-AQUI') || PUBLIC_BASE_URL.includes('seudominio')) console.warn('[AVISO] Configure PUBLIC_BASE_URL com a URL HTTPS do Cloudflare Tunnel (teste) ou do backend na VPS.');
  if (!MP_WEBHOOK_SECRET || MP_WEBHOOK_SECRET.includes('COLE_AQUI')) console.warn('[AVISO] MP_WEBHOOK_SECRET ainda não configurado. Cadastre o Webhook no Mercado Pago e cole a assinatura secreta no .env.');
});
