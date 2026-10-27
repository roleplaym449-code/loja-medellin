const API_BASE_URL = (() => {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = String(params.get('api') || '').trim().replace(/\/$/, '');

  // Durante os testes, você pode trocar o Cloudflare Tunnel sem republicar
  // a Vercel. Basta abrir: https://seu-site.vercel.app/?api=https://novo.trycloudflare.com
  if (fromQuery && /^https:\/\//i.test(fromQuery)) {
    localStorage.setItem('medellin_api_base_url', fromQuery);
  }

  const saved = String(localStorage.getItem('medellin_api_base_url') || '').trim().replace(/\/$/, '');
  const configured = String(window.MEDELLIN_CONFIG?.DEFAULT_API_BASE_URL || '').trim().replace(/\/$/, '');
  const chosen = fromQuery || saved || configured;

  // Se frontend e backend estiverem juntos localmente, chamadas relativas funcionam.
  if (!chosen && ['localhost', '127.0.0.1'].includes(location.hostname)) return '';
  return chosen;
})();


function apiUrl(path){
  if (API_BASE_URL === '') return path;
  if (API_BASE_URL.includes('COLE-AQUI')) {
    throw new Error('Backend não configurado. Abra config.js e informe a URL HTTPS do Cloudflare Tunnel.');
  }
  return `${API_BASE_URL}${path}`;
}

const cart = [];
const drawer = document.getElementById('drawer');
const shade = document.getElementById('shade');
const count = document.getElementById('cartCount');
const items = document.getElementById('cartItems');
const total = document.getElementById('cartTotal');
const title = document.getElementById('catalogTitle');
const subtitle = document.getElementById('catalogSubtitle');
const paymentModal = document.getElementById('paymentModal');
let activeOrderId = null;
let statusTimer = null;

function money(v){ return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function cartTotal(){ return cart.reduce((s,p)=>s+p.price,0); }

function renderCart(){
  count.textContent = cart.length;
  if(!cart.length){
    items.innerHTML = '<p class="empty">Seu carrinho está vazio.</p>';
    total.textContent = money(0); return;
  }
  items.innerHTML = cart.map((p,i)=>`
    <div class="cart-item">
      <div><b>${p.name}</b><br><small>${money(p.price)}</small></div>
      <button onclick="removeItem(${i})">Remover</button>
    </div>`).join('');
  total.textContent = money(cartTotal());
}
window.removeItem=i=>{cart.splice(i,1);renderCart();}
function openCart(){drawer.classList.add('open');shade.classList.add('show')}
function closeCart(){drawer.classList.remove('open');shade.classList.remove('show')}

function resetPaymentModal(){
  activeOrderId=null;
  if(statusTimer){clearInterval(statusTimer);statusTimer=null;}
  document.getElementById('buyerStep').hidden=false;
  document.getElementById('pixStep').hidden=true;
  document.getElementById('successStep').hidden=true;
  document.getElementById('paymentError').textContent='';
}
function openPayment(){
  if(!cart.length){alert('Adicione um pacote de diamantes ao carrinho primeiro.');return;}
  if(cart.some(p=>!p.productId)){
    alert('A entrega automática por PIX está disponível para os pacotes de diamantes. Remova os outros serviços do carrinho para continuar.');return;
  }
  closeCart(); resetPaymentModal();
  document.getElementById('paymentTotal').textContent=money(cartTotal());
  paymentModal.classList.add('show'); paymentModal.setAttribute('aria-hidden','false');
}
function closePayment(){
  paymentModal.classList.remove('show'); paymentModal.setAttribute('aria-hidden','true');
  if(statusTimer){clearInterval(statusTimer);statusTimer=null;}
}

document.querySelectorAll('.buy').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const diamonds=Number(btn.dataset.diamonds||0);
    const name=btn.dataset.product || `💎 ${diamonds.toLocaleString('pt-BR')} Diamantes`;
    cart.push({name,price:Number(btn.dataset.price),productId:btn.dataset.productId||null,diamonds});
    renderCart();openCart();
  });
});
document.getElementById('cartBtn').onclick=openCart;
document.getElementById('closeCart').onclick=closeCart;
shade.onclick=closeCart;
document.getElementById('checkout').onclick=openPayment;
document.getElementById('paymentClose').onclick=closePayment;
document.getElementById('finishPayment').onclick=()=>{cart.splice(0);renderCart();closePayment();};
paymentModal.addEventListener('click',e=>{ if(e.target===paymentModal) closePayment(); });

let currentFilter='diamantes';
function applyFilter(filter){
  currentFilter=filter;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));
  document.querySelectorAll('.product-card').forEach(card=>{card.hidden=filter!=='all'&&card.dataset.category!==filter;});
  if(filter==='diamantes'){title.textContent='Pacotes de Diamantes';subtitle.textContent='200 Diamantes = R$ 1,00. Escolha o pacote ideal para você.'}
  else if(filter==='outros'){title.textContent='Outros Produtos';subtitle.textContent='Serviços especiais da Medellín Roleplay.'}
  else {title.textContent='Catálogo Completo';subtitle.textContent='Todos os produtos disponíveis na loja.'}
}
document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>applyFilter(btn.dataset.filter)));
document.getElementById('search').addEventListener('input',e=>{
  const q=e.target.value.toLowerCase().trim();
  document.querySelectorAll('.product-card').forEach(card=>{
    const allowed=currentFilter==='all'||card.dataset.category===currentFilter;
    card.hidden=!(allowed&&card.dataset.name.toLowerCase().includes(q));
  });
});
applyFilter('diamantes');

async function checkOrder(){
  if(!activeOrderId)return;
  try{
    const r=await fetch(apiUrl(`/api/orders/${encodeURIComponent(activeOrderId)}/status`),{cache:'no-store'});
    if(!r.ok)return;
    const data=await r.json();
    if(data.delivered){
      clearInterval(statusTimer);statusTimer=null;
      document.getElementById('pixStep').hidden=true;
      document.getElementById('successStep').hidden=false;
      document.getElementById('successText').textContent=`${Number(data.diamonds).toLocaleString('pt-BR')} diamantes entregues para ${data.nick} (passaporte ${data.passport}).`;
    }else if(data.status==='approved'||data.status==='processed'){
      document.getElementById('paymentStatus').innerHTML='<span class="status-dot"></span><b>Pagamento aprovado. Entregando diamantes...</b>';
    }
  }catch(_){ }
}

document.getElementById('generatePix').onclick=async()=>{
  const passport=document.getElementById('buyerPassport').value.trim();
  const nick=document.getElementById('buyerNick').value.trim();
  const email=document.getElementById('buyerEmail').value.trim();
  const error=document.getElementById('paymentError');
  const btn=document.getElementById('generatePix');
  error.textContent=''; btn.disabled=true; btn.textContent='GERANDO PIX...';
  try{
    const r=await fetch(apiUrl('/api/pix'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:cart.map(p=>p.productId),passport,nick,email})});
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'Não foi possível gerar o PIX.');
    activeOrderId=data.orderId;
    document.getElementById('buyerStep').hidden=true;
    document.getElementById('pixStep').hidden=false;
    const qr=document.getElementById('pixQr');
    if(data.qrCodeBase64){qr.src=`data:image/png;base64,${data.qrCodeBase64}`;qr.hidden=false;}else{qr.hidden=true;}
    document.getElementById('pixCode').value=data.qrCode||'';
    const link=document.getElementById('ticketLink');
    if(data.ticketUrl){link.href=data.ticketUrl;link.hidden=false;}else link.hidden=true;
    document.getElementById('pixDescription').textContent=`PIX de ${money(data.amount)} • ${Number(data.diamonds).toLocaleString('pt-BR')} diamantes. A entrega ocorre após a confirmação.`;
    statusTimer=setInterval(checkOrder,4000); checkOrder();
  }catch(e){error.textContent=e.message;}
  finally{btn.disabled=false;btn.textContent='GERAR QR CODE PIX';}
};

document.getElementById('copyPix').onclick=async()=>{
  const code=document.getElementById('pixCode').value;
  if(!code)return;
  await navigator.clipboard.writeText(code);
  const b=document.getElementById('copyPix');const old=b.textContent;b.textContent='PIX COPIADO ✓';setTimeout(()=>b.textContent=old,1800);
};
