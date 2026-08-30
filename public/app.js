const MESES = {1:"Enero",2:"Febrero",3:"Marzo",4:"Abril",5:"Mayo",6:"Junio",7:"Julio",8:"Agosto",9:"Septiembre",10:"Octubre",11:"Noviembre",12:"Diciembre"};
let TX = [];
let currentFilter = "all";
let currentTasa = 800;
let editingId = null;
let liveRates = null; // { bcv:{price,lastUpdate}, binance:{price,lastUpdate}, fetchedAt, errors }
let liveRatesLoading = true;
let currentRole = null; // 'admin' | 'view' | null
const INACTIVITY_LIMIT_MS = 5 * 60 * 1000; // 5 minutos
let lastActivityWriteAt = 0;

function fmt(n, d=2){ return (n||0).toLocaleString('es-VE', {minimumFractionDigits:d, maximumFractionDigits:d}); }
function fmtBs(n){ return "Bs " + Math.round(n||0).toLocaleString('es-VE'); }
function dateOnly(d){ return (d||"").slice(0,10); }
function parseISO(d){ const [y,m,day] = dateOnly(d).split("-").map(Number); return new Date(y, m-1, day); }

function renderGate(errorMsg){
  const app = document.getElementById('app');
  document.getElementById('fabAdd').style.display = 'none';
  currentRole = null;
  sessionStorage.removeItem('ahorro_pin');
  sessionStorage.removeItem('ahorro_role');
  sessionStorage.removeItem('ahorro_lastActivity');
  app.innerHTML = `
    <div class="hero">
      <p class="hero-eyebrow">Libreta de ahorro · USDT</p>
      <h1 class="hero-title serif">Ingresa tu PIN</h1>
      <p style="margin-top:10px; font-size:13px; color:#DCE7DF;">Usa tu PIN de consulta para ver, o el de administrador para ver y editar.</p>
    </div>
    <div class="card" style="margin-top:14px;">
      ${errorMsg ? `<div class="msg err">${errorMsg}</div>` : ''}
      <div class="field"><label>PIN</label><input type="password" id="gatePin" inputmode="numeric" placeholder="••••"></div>
      <div class="modal-actions" style="margin-top:4px;"><button class="btn-primary" id="gateBtn" style="flex:1;">Entrar</button></div>
    </div>
  `;
  const pinField = document.getElementById('gatePin');
  document.getElementById('gateBtn').addEventListener('click', ()=> attemptUnlock(pinField.value.trim()));
  pinField.addEventListener('keydown', (e)=>{ if(e.key==='Enter') attemptUnlock(pinField.value.trim()); });
  pinField.focus();
}

function attemptUnlock(pin){
  if(!pin) return;
  loadData(pin);
}

async function loadData(pin){
  try{
    const res = await fetch('/api/transactions', { headers: pin ? {'x-pin': pin} : {} });
    if(res.status === 401){
      renderGate('PIN incorrecto.');
      return;
    }
    const data = await res.json();
    TX = data.transactions || [];
    currentRole = data.role;
    sessionStorage.setItem('ahorro_pin', pin);
    sessionStorage.setItem('ahorro_role', currentRole);
    sessionStorage.setItem('ahorro_lastActivity', Date.now().toString());
    TX.sort((a,b)=> dateOnly(a.date)+((a.time)||"00:00") < dateOnly(b.date)+((b.time)||"00:00") ? -1 : 1);
    render();
  }catch(e){
    document.getElementById('app').innerHTML = `<div class="loading">Error cargando datos. Revisa tu conexión.</div>`;
  }
}

// ---------- Cierre de sesión por inactividad (5 minutos) ----------
function touchActivity(){
  if(!currentRole) return; // solo cuenta si hay una sesión abierta
  const now = Date.now();
  if(now - lastActivityWriteAt < 5000) return; // no escribir en cada movimiento del mouse
  lastActivityWriteAt = now;
  sessionStorage.setItem('ahorro_lastActivity', now.toString());
}
['click','touchstart','keydown','mousemove','scroll'].forEach(evt=>{
  window.addEventListener(evt, touchActivity, {passive:true});
});
setInterval(()=>{
  if(!currentRole) return;
  const last = parseInt(sessionStorage.getItem('ahorro_lastActivity') || '0', 10);
  if(Date.now() - last > INACTIVITY_LIMIT_MS){
    renderGate('Sesión cerrada por inactividad. Ingresa tu PIN de nuevo.');
  }
}, 15000);

async function loadLiveRates(){
  try{
    const res = await fetch('/api/rates');
    liveRates = await res.json();
  }catch(e){
    liveRates = { bcv:null, binance:null, errors:['No se pudo cargar tasas en vivo.'] };
  }
  liveRatesLoading = false;
  renderRateChips();
}

function renderRateChips(){
  const box = document.getElementById('rateChips');
  if(!box) return;
  if(liveRatesLoading){
    box.innerHTML = `<span class="rate-chip loading-chip">Buscando tasas en vivo…</span>`;
    return;
  }
  if(!liveRates || (!liveRates.bcv && !liveRates.binance)){
    box.innerHTML = `<span class="rate-chip err-chip">No se pudieron cargar tasas en vivo. <button id="retryRates" class="chip-retry">Reintentar</button></span>`;
    document.getElementById('retryRates')?.addEventListener('click', ()=>{
      liveRatesLoading = true; renderRateChips(); loadLiveRates();
    });
    return;
  }
  let html = '';
  if(liveRates.bcv){
    html += `<button class="rate-chip" data-tasa="${liveRates.bcv.price}">BCV · ${fmt(liveRates.bcv.price)} Bs</button>`;
  }
  if(liveRates.binance){
    html += `<button class="rate-chip binance" data-tasa="${liveRates.binance.price}">Binance P2P · ${fmt(liveRates.binance.price)} Bs</button>`;
  }
  box.innerHTML = html;
  box.querySelectorAll('.rate-chip[data-tasa]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      currentTasa = parseFloat(btn.dataset.tasa);
      render();
    });
  });
}

function computeRunningBalances(){
  let running = 0;
  return TX.map(tx => {
    running += tx.type === 'in' ? Number(tx.usdt) : -Number(tx.usdt);
    return {...tx, saldo: running};
  });
}

function totals(){
  let bsIn=0, bsOut=0, usdtIn=0, usdtOut=0;
  TX.forEach(tx=>{
    if(tx.type==='in'){ bsIn += Number(tx.bs); usdtIn += Number(tx.usdt); }
    else { bsOut += Number(tx.bs); usdtOut += Number(tx.usdt); }
  });
  const saldo = usdtIn - usdtOut;
  const tasaProm = usdtIn > 0 ? bsIn/usdtIn : 0;
  const neto = bsIn - bsOut;
  return {bsIn, bsOut, usdtIn, usdtOut, saldo, tasaProm, neto};
}

function render(){
  const app = document.getElementById('app');
  const fab = document.getElementById('fabAdd');
  fab.style.display = currentRole === 'admin' ? 'block' : 'none';

  if(TX.length === 0){
    app.innerHTML = `
      <div class="hero">
        <p class="hero-eyebrow">Libreta de ahorro · USDT</p>
        <h1 class="hero-title serif">Sin movimientos todavía</h1>
        <p style="margin-top:14px; font-size:13px; color:#DCE7DF;">Aún no hay movimientos registrados.</p>
      </div>
      <p class="timestamp"><a href="#" id="changePin" style="color:inherit;">Cambiar PIN</a></p>
    `;
    document.getElementById('changePin').addEventListener('click', (e)=>{
      e.preventDefault();
      renderGate();
    });
    return;
  }

  const t = totals();
  const valorHoy = t.saldo * currentTasa;
  const ganancia = valorHoy - t.neto;
  const pct = t.neto ? (ganancia/t.neto*100) : 0;
  const withBalances = computeRunningBalances();

  app.innerHTML = `
    <div class="hero">
      <div class="hero-top">
        <div>
          <p class="hero-eyebrow">Libreta de ahorro · USDT</p>
          <h1 class="hero-title serif">Control de ahorro P2P</h1>
        </div>
        <svg class="stamp" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="none" stroke="#D7C58C" stroke-width="2.5"/>
          <circle cx="50" cy="50" r="38" fill="none" stroke="#D7C58C" stroke-width="1"/>
          <text x="50" y="55" text-anchor="middle" font-size="20" fill="#D7C58C" font-family="Georgia, serif">✓</text>
        </svg>
      </div>
      <div class="hero-balance">
        <p class="label">Saldo actual</p>
        <p class="amount mono">${fmt(t.saldo)}<span>USDT</span></p>
        <p class="approx" id="heroApprox">≈ ${fmtBs(valorHoy)} al valorizar hoy</p>
      </div>
      <div class="hero-foot">
        <span class="pill">Aportado neto: ${fmtBs(t.neto)}</span>
        <span class="pill ${ganancia>=0?'pos':'neg'}" id="heroProtPill">Protección: ${pct>=0?'+':''}${fmt(pct,1)}%</span>
      </div>
    </div>
    <div class="tear"></div>

    <p class="section-label">Resumen del movimiento</p>
    <div class="grid2">
      <div class="stat"><p class="k">Total depositado</p><p class="v mono">${fmtBs(t.bsIn)}</p></div>
      <div class="stat"><p class="k">Total retirado</p><p class="v mono">${fmtBs(t.bsOut)}</p></div>
      <div class="stat"><p class="k">USDT comprado</p><p class="v mono">${fmt(t.usdtIn)}</p></div>
      <div class="stat"><p class="k">USDT vendido</p><p class="v mono">${fmt(t.usdtOut)}</p></div>
      <div class="stat wide">
        <div><p class="k">Tasa promedio de compra</p><p class="v mono" style="font-size:15px">${fmt(t.tasaProm)} Bs/USDT</p></div>
        <div style="text-align:right"><p class="k">Saldo USDT</p><p class="v mono" style="font-size:15px">${fmt(t.saldo)}</p></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3 class="serif">Simulador de valor hoy</h3><span>editable</span></div>
      <div class="rate-chips" id="rateChips"></div>
      <div class="row">
        <label>Tasa Bs/USDT actual</label>
        <div class="input-box"><span>Bs</span><input type="number" id="tasaInput" value="${currentTasa}" inputmode="decimal" step="1"></div>
      </div>
      <input type="range" id="tasaSlider" min="200" max="2000" step="1" value="${currentTasa}">
      <div class="sim-results">
        <div class="r"><p class="k">Valor del saldo hoy</p><p class="v mono" id="simValor">${fmtBs(valorHoy)}</p></div>
        <div class="r"><p class="k">Vs. lo aportado neto</p><p class="v mono" id="simGanancia" style="color:${ganancia>=0?'var(--green)':'var(--red)'}">${ganancia>=0?'+':'-'}${fmtBs(Math.abs(ganancia))}</p></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3 class="serif">📅 Saldo en una fecha</h3><span>calendario</span></div>
      <div class="row">
        <label>Ver saldo al día</label>
        <div class="input-box"><input type="date" id="calDate"></div>
      </div>
      <div id="calResult"></div>
      <svg class="spark" id="sparkChart" viewBox="0 0 300 70" preserveAspectRatio="none"></svg>
    </div>

    <p class="section-label">Movimientos</p>
    <div class="tabs" id="tabs">
      <div class="tab ${currentFilter==='all'?'active':''}" data-f="all">Todos</div>
      <div class="tab ${currentFilter==='in'?'active':''}" data-f="in">Entradas</div>
      <div class="tab ${currentFilter==='out'?'active':''}" data-f="out">Salidas</div>
    </div>
    <div id="timeline"></div>

    <div class="footer-card">
      <h4 class="serif">Cómo funciona</h4>
      <p>Toca cualquier movimiento en la lista para ver el detalle. El saldo y los totales se recalculan solos.</p>
    </div>
    <p class="timestamp" id="lastUpdate"></p>
    <p class="timestamp"><a href="#" id="changePin" style="color:inherit;">Cambiar PIN</a></p>
  `;

  renderTimeline(withBalances);
  renderCalendar(withBalances);
  wireEvents();
  renderRateChips();
  document.getElementById('lastUpdate').textContent = 'Última actualización: ' + new Date().toLocaleDateString('es-VE', {day:'numeric', month:'long', year:'numeric'});
  document.getElementById('changePin').addEventListener('click', (e)=>{
    e.preventDefault();
    renderGate();
  });
}

function renderTimeline(withBalances){
  const tl = document.getElementById('timeline');
  tl.innerHTML = "";
  let lastMonth = "";
  withBalances.forEach(tx => {
    if(currentFilter!=='all' && tx.type!==currentFilter) return;
    const d = parseISO(tx.date);
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
    if(monthKey !== lastMonth){
      lastMonth = monthKey;
      const div = document.createElement('div');
      div.className = 'month-divider';
      div.textContent = `${MESES[d.getMonth()+1]} ${d.getFullYear()}`;
      tl.appendChild(div);
    }
    const tasaEf = tx.bs / tx.usdt;
    const el = document.createElement('div');
    el.className = 'entry';
    el.innerHTML = `
      <div class="entry-head">
        <div class="dot ${tx.type}">${tx.type==='in'?'↓':'↑'}</div>
        <div class="entry-mid">
          <div class="date">${d.getDate()} de ${MESES[d.getMonth()+1].toLowerCase()}${tx.time?' · '+tx.time:''}</div>
          <div class="desc">${tx.desc||''}</div>
        </div>
        <div class="entry-amt">
          <div class="usdt ${tx.type} mono">${tx.type==='in'?'+':'−'}${fmt(tx.usdt)} USDT</div>
          <div class="bs mono">${fmtBs(tx.bs)}</div>
        </div>
        <div class="chev">▾</div>
      </div>
      <div class="entry-detail">
        <div class="detail-grid">
          <div><p class="d-k">Tasa</p><p class="d-v mono">${fmt(tx.tasa)}</p></div>
          <div><p class="d-k">Tasa efectiva</p><p class="d-v mono">${fmt(tasaEf)}</p></div>
          <div><p class="d-k">Saldo acumulado</p><p class="d-v mono">${fmt(tx.saldo)} USDT</p></div>
          <div><p class="d-k">Operación</p><p class="d-v mono" style="font-size:11px">${tx.op||'—'}</p></div>
        </div>
        ${tx.note ? `<div class="detail-note"><b>Nota:</b> ${tx.note}</div>` : ""}
        ${currentRole === 'admin' ? `
        <div class="detail-actions">
          <button class="edit-btn" data-id="${tx.id}">Editar</button>
          <button class="danger del-btn" data-id="${tx.id}">Borrar</button>
        </div>` : ""}
      </div>
    `;
    el.querySelector('.entry-head').addEventListener('click', ()=> el.classList.toggle('open'));
    el.querySelector('.edit-btn')?.addEventListener('click', (e)=>{ e.stopPropagation(); openModal(tx); });
    el.querySelector('.del-btn')?.addEventListener('click', (e)=>{ e.stopPropagation(); deleteTx(tx.id); });
    tl.appendChild(el);
  });
}

function renderCalendar(withBalances){
  const input = document.getElementById('calDate');
  const resultEl = document.getElementById('calResult');
  const spark = document.getElementById('sparkChart');

  function drawSpark(){
    if(withBalances.length < 2){ spark.innerHTML=''; return; }
    const vals = withBalances.map(t=>t.saldo);
    const min = Math.min(...vals, 0), max = Math.max(...vals);
    const range = (max-min) || 1;
    const stepX = 300/(vals.length-1);
    const pts = vals.map((v,i)=> `${(i*stepX).toFixed(1)},${(70 - ((v-min)/range*60) - 5).toFixed(1)}`).join(' ');
    spark.innerHTML = `<polyline points="${pts}" fill="none" stroke="#0F7A57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  drawSpark();

  function showForDate(dateStr){
    if(!dateStr){ resultEl.innerHTML=''; return; }
    const upTo = withBalances.filter(t => dateOnly(t.date) <= dateStr);
    if(upTo.length===0){
      resultEl.innerHTML = `<div class="cal-result"><div class="sub">Todavía no había movimientos en esa fecha.</div></div>`;
      return;
    }
    const last = upTo[upTo.length-1];
    const sameDay = upTo.filter(t=> dateOnly(t.date) === dateStr);
    const [y,m,d] = dateStr.split('-');
    resultEl.innerHTML = `
      <div class="cal-result">
        <div class="amt mono">${fmt(last.saldo)} USDT</div>
        <div class="sub">Saldo acumulado al ${d}/${m}/${y} (≈ ${fmtBs(last.saldo*currentTasa)} a la tasa actual del simulador)</div>
        ${sameDay.length ? `<div class="sub" style="margin-top:6px">${sameDay.length} movimiento(s) ese día: ${sameDay.map(t=> (t.type==='in'?'+':'−')+fmt(t.usdt)).join(', ')} USDT</div>` : ''}
      </div>
    `;
  }
  input.addEventListener('change', ()=> showForDate(input.value));
}

function wireEvents(){
  document.querySelectorAll('.tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{ currentFilter = tab.dataset.f; render(); });
  });
  const tasaInput = document.getElementById('tasaInput');
  const tasaSlider = document.getElementById('tasaSlider');
  function updateSim(){
    currentTasa = parseFloat(tasaInput.value) || 0;
    render();
  }
  tasaInput.addEventListener('change', updateSim);
  tasaSlider.addEventListener('input', ()=>{ tasaInput.value = tasaSlider.value; });
  tasaSlider.addEventListener('change', updateSim);
}

// ---------- MODAL: agregar / editar / borrar ----------
const overlay = document.getElementById('modalOverlay');
const savedPin = () => sessionStorage.getItem('ahorro_pin') || '';

function openModal(tx){
  editingId = tx ? tx.id : null;
  document.getElementById('modalTitle').textContent = tx ? 'Editar movimiento' : 'Nuevo movimiento';
  document.getElementById('formMsg').className = 'msg';
  document.getElementById('formMsg').textContent = '';
  document.getElementById('photoHint').className = 'photo-hint';
  document.getElementById('photoHint').textContent = 'Toma foto al recibo de Binance con buena luz y derecho — revisa los datos antes de guardar.';
  document.getElementById('pinInput').value = savedPin();
  document.getElementById('fId').value = tx ? tx.id : '';
  document.getElementById('fDate').value = tx ? dateOnly(tx.date) : new Date().toISOString().slice(0,10);
  document.getElementById('fTime').value = tx ? (tx.time||'') : '';
  document.getElementById('fDesc').value = tx ? (tx.desc||'') : '';
  document.getElementById('fBs').value = tx ? tx.bs : '';
  document.getElementById('fTasa').value = tx ? tx.tasa : '';
  document.getElementById('fUsdt').value = tx ? tx.usdt : '';
  document.getElementById('fNote').value = tx ? (tx.note||'') : '';
  setType(tx ? tx.type : 'in');
  overlay.classList.add('open');
}
function closeModal(){ overlay.classList.remove('open'); }
function setType(type){
  document.getElementById('btnTypeIn').classList.toggle('sel-in', type==='in');
  document.getElementById('btnTypeOut').classList.toggle('sel-out', type==='out');
  overlay.dataset.type = type;
}
document.getElementById('fabAdd').addEventListener('click', ()=> openModal(null));
document.getElementById('btnCancel').addEventListener('click', closeModal);
document.getElementById('btnTypeIn').addEventListener('click', ()=> setType('in'));
document.getElementById('btnTypeOut').addEventListener('click', ()=> setType('out'));

// ---------- Lectura de recibo por foto (OCR gratuito, 100% en el navegador) ----------
document.getElementById('btnPhoto').addEventListener('click', ()=> document.getElementById('fPhoto').click());
document.getElementById('fPhoto').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const hint = document.getElementById('photoHint');
  const btn = document.getElementById('btnPhoto');
  hint.className = 'photo-hint';
  hint.textContent = 'Leyendo la foto… puede tardar unos segundos.';
  btn.disabled = true;
  try{
    const { data: { text } } = await Tesseract.recognize(file, 'spa+eng');
    const found = parseReceiptText(text);
    applyParsedFields(found);
    const count = Object.keys(found).length;
    if(count === 0){
      hint.className = 'photo-hint err';
      hint.textContent = 'No se pudo leer ningún dato claro de la foto. Intenta con más luz o más derecho, o llena a mano.';
    } else {
      hint.className = 'photo-hint ok';
      hint.textContent = `Se llenaron ${count} campo(s) automáticamente. Revisa que estén correctos antes de guardar.`;
    }
  }catch(err){
    hint.className = 'photo-hint err';
    hint.textContent = 'No se pudo leer la foto. Llena los datos a mano.';
  }finally{
    btn.disabled = false;
    e.target.value = '';
  }
});

// Reglas simples sobre el texto reconocido por OCR, basadas en las etiquetas
// que Binance P2P siempre usa en sus recibos ("Monto", "Precio", "Cantidad", etc.)
function parseReceiptText(text){
  const found = {};
  const norm = text.replace(/,/g, '.'); // normaliza separador decimal
  const lines = norm.split('\n').map(l=>l.trim()).filter(Boolean);
  const numberAfter = (regex) => {
    const m = norm.match(regex);
    if(!m) return null;
    const n = parseFloat(m[1].replace(/[^\d.]/g, ''));
    return isNaN(n) ? null : n;
  };

  // Monto en Bs (a veces etiquetado "Monto", "Total", "Importe")
  const bs = numberAfter(/(?:Monto|Total|Importe)[^\d]{0,10}([\d.,]+)\s*(?:VES|Bs)?/i);
  if(bs !== null) found.bs = bs;

  // Precio / tasa (Bs por USDT)
  const tasa = numberAfter(/(?:Precio|Tasa)[^\d]{0,10}([\d.,]+)/i);
  if(tasa !== null) found.tasa = tasa;

  // Cantidad en USDT
  const usdt = numberAfter(/(?:Cantidad)[^\d]{0,10}([\d.,]+)\s*USDT/i) || numberAfter(/([\d.,]+)\s*USDT/i);
  if(usdt !== null) found.usdt = usdt;

  // Número de orden / referencia
  const op = norm.match(/(?:N[uú]mero de orden|Order Number|N[uú]m\.?\s*de\s*orden)[:\s]*([A-Z0-9]{6,})/i);
  if(op) found.op = op[1];

  // Fecha (formatos comunes dd/mm/yyyy o yyyy-mm-dd)
  const dateMatch = norm.match(/(\d{4})[-/](\d{2})[-/](\d{2})/) || norm.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
  if(dateMatch){
    if(dateMatch[1].length === 4){
      found.date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    } else {
      found.date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }
  }

  // Hora (hh:mm)
  const timeMatch = norm.match(/([01]?\d|2[0-3]):([0-5]\d)(?::\d{2})?/);
  if(timeMatch) found.time = `${timeMatch[1].padStart(2,'0')}:${timeMatch[2]}`;

  // Tipo: compra vs venta
  if(/venta|sell/i.test(norm)) found.type = 'out';
  else if(/compra|buy/i.test(norm)) found.type = 'in';

  // Contraparte (línea que suele decir "Contraparte" o "Counterparty")
  const cpLine = lines.find(l => /contraparte|counterparty/i.test(l));
  if(cpLine){
    const val = cpLine.split(/[:\-]/).slice(1).join(':').trim();
    if(val) found.desc = val;
  }

  // Si ya tenemos bs y usdt pero no la tasa, la calculamos
  if(found.bs && found.usdt && !found.tasa){
    found.tasa = Math.round((found.bs / found.usdt) * 100) / 100;
  }
  return found;
}

function applyParsedFields(found){
  if(found.date) document.getElementById('fDate').value = found.date;
  if(found.time) document.getElementById('fTime').value = found.time;
  if(found.desc) document.getElementById('fDesc').value = found.desc;
  if(found.bs !== undefined) document.getElementById('fBs').value = found.bs;
  if(found.tasa !== undefined) document.getElementById('fTasa').value = found.tasa;
  if(found.usdt !== undefined) document.getElementById('fUsdt').value = found.usdt;
  if(found.type) setType(found.type);
}

document.getElementById('btnSave').addEventListener('click', async ()=>{
  const pin = document.getElementById('pinInput').value.trim();
  const tx = {
    type: overlay.dataset.type || 'in',
    date: document.getElementById('fDate').value,
    time: document.getElementById('fTime').value,
    desc: document.getElementById('fDesc').value.trim(),
    bs: parseFloat(document.getElementById('fBs').value),
    tasa: parseFloat(document.getElementById('fTasa').value),
    usdt: parseFloat(document.getElementById('fUsdt').value),
    note: document.getElementById('fNote').value.trim(),
    op: '—'
  };
  const msg = document.getElementById('formMsg');
  if(!tx.date || isNaN(tx.bs) || isNaN(tx.tasa) || isNaN(tx.usdt)){
    msg.className='msg err'; msg.textContent='Completa fecha, Bs, tasa y USDT.'; return;
  }
  if(!pin){ msg.className='msg err'; msg.textContent='Ingresa el PIN.'; return; }
  sessionStorage.setItem('ahorro_pin', pin);

  try{
    let res;
    if(editingId){
      res = await fetch('/api/transactions', {method:'PUT', headers:{'Content-Type':'application/json','x-admin-pin':pin},
        body: JSON.stringify({id: editingId, transaction: tx})});
    } else {
      res = await fetch('/api/transactions', {method:'POST', headers:{'Content-Type':'application/json','x-admin-pin':pin},
        body: JSON.stringify({transaction: tx})});
    }
    if(!res.ok){ const e = await res.json(); throw new Error(e.error||'Error al guardar'); }
    TX = await res.json();
    closeModal();
    render();
  }catch(e){
    msg.className='msg err'; msg.textContent = e.message;
  }
});

async function deleteTx(id){
  const pin = savedPin() || prompt('PIN para borrar:');
  if(!pin) return;
  if(!confirm('¿Borrar este movimiento? No se puede deshacer.')) return;
  try{
    const res = await fetch(`/api/transactions?id=${encodeURIComponent(id)}`, {method:'DELETE', headers:{'x-admin-pin':pin}});
    if(!res.ok){ const e = await res.json(); throw new Error(e.error||'Error al borrar'); }
    sessionStorage.setItem('ahorro_pin', pin);
    TX = await res.json();
    render();
  }catch(e){
    alert(e.message);
  }
}

const savedSessionPin = sessionStorage.getItem('ahorro_pin');
const savedLastActivity = parseInt(sessionStorage.getItem('ahorro_lastActivity') || '0', 10);
if(savedSessionPin && (Date.now() - savedLastActivity) < INACTIVITY_LIMIT_MS){
  loadData(savedSessionPin);
} else if(savedSessionPin){
  renderGate('Sesión cerrada por inactividad. Ingresa tu PIN de nuevo.');
} else {
  renderGate();
}
loadLiveRates();
