/* ── State ──────────────────────────────────────────────────────── */
let funcionario   = null;  // { id, codigo, nome }
let status        = null;  // { registros, ultimo, permitidos, cooldown_seg }
let timerInterval = null;
let cooldownInterval = null;
let cameraStream  = null;
let capturedBlob  = null;  // foto capturada pela câmera

/* ── DOM refs ───────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── Init ───────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  startClock();

  // Check if empresa is configured
  try {
    const cfg = await (await fetch('/api/config')).json();
    if (!cfg.configurado) {
      showScreen('setup');
      $('btn-setup-salvar').addEventListener('click', salvarSetup);
      $('setup-empresa').addEventListener('keydown', e => { if (e.key === 'Enter') salvarSetup(); });
      return;
    }
    aplicarEmpresa(cfg.empresa);
  } catch {
    // se falhar, continua para o login normalmente
  }

  showScreen('login');
  restoreLogin();

  $('input-codigo').addEventListener('input', onCodigoInput);
  $('input-codigo').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  $('btn-entrar').addEventListener('click', tryLogin);
  $('btn-sair').addEventListener('click', logout);

  document.querySelectorAll('.punch-btn').forEach(btn =>
    btn.addEventListener('click', () => onPunchClick(btn.dataset.tipo))
  );

  // Saída modal
  $('btn-saida-cancelar').addEventListener('click', fecharModalSaida);
  $('btn-saida-confirmar').addEventListener('click', confirmarSaida);

  // Camera
  $('btn-abrir-cam').addEventListener('click', abrirCamera);
  $('btn-capturar').addEventListener('click', capturarFoto);
  $('btn-cancelar-cam').addEventListener('click', fecharCamera);
  $('btn-retirar').addEventListener('click', retirarNovamente);
});

/* ── Clock ──────────────────────────────────────────────────────── */
function startClock() {
  function tick() {
    const now = new Date();
    $('hdr-hora').textContent = formatHHMMSS(now);
    $('hdr-data').textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  }
  tick();
  setInterval(tick, 1000);
}

/* ── Setup (primeira instalação) ────────────────────────────────── */
async function salvarSetup() {
  const empresa = $('setup-empresa').value.trim();
  $('setup-error').classList.add('hidden');
  if (!empresa) { $('setup-error').textContent = 'Informe o nome da empresa.'; $('setup-error').classList.remove('hidden'); return; }

  try {
    const res = await fetch('/api/config/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa })
    });
    if (!res.ok) { const d = await res.json(); $('setup-error').textContent = d.error; $('setup-error').classList.remove('hidden'); return; }
    aplicarEmpresa(empresa);
    restoreLogin();
    showScreen('login');
  } catch {
    $('setup-error').textContent = 'Erro de conexão.';
    $('setup-error').classList.remove('hidden');
  }
}

function aplicarEmpresa(nome) {
  document.title = nome;
  const el = $('login-empresa-nome');
  if (el) el.textContent = nome;
}

/* ── Login ──────────────────────────────────────────────────────── */
function restoreLogin() {
  const saved = localStorage.getItem('gw_funcionario');
  if (!saved) return;
  try {
    const f = JSON.parse(saved);
    $('input-codigo').value = f.codigo;
    $('chk-salvar').checked = true;
    validateCodigo(f.codigo);
  } catch {}
}

let debounceTimer = null;
function onCodigoInput() {
  const inp = $('input-codigo');
  inp.value = inp.value.trim().toUpperCase();
  clearTimeout(debounceTimer);
  $('funcionario-preview').classList.add('hidden');
  $('btn-entrar').disabled = true;
  $('login-error').classList.add('hidden');
  if (inp.value.length < 2) return;
  debounceTimer = setTimeout(() => validateCodigo(inp.value), 500);
}

async function validateCodigo(codigo) {
  try {
    const res = await fetch(`/api/funcionarios/codigo/${encodeURIComponent(codigo)}`);
    if (!res.ok) { showLoginError((await res.json()).error); return; }
    const f = await res.json();
    funcionario = f;
    $('preview-nome').textContent = f.nome;
    $('funcionario-preview').classList.remove('hidden');
    $('btn-entrar').disabled = false;
  } catch {
    showLoginError('Erro de conexão.');
  }
}

async function tryLogin() {
  if (!funcionario) return;
  if ($('chk-salvar').checked) {
    localStorage.setItem('gw_funcionario', JSON.stringify(funcionario));
  } else {
    localStorage.removeItem('gw_funcionario');
  }
  $('hdr-nome').textContent = funcionario.nome;
  showScreen('ponto');
  await loadStatus();
}

function logout() {
  fecharCamera();
  showScreen('login');
  clearTimer();
  clearCooldown();
  funcionario = null;
  status = null;
}

/* ── Status & UI ─────────────────────────────────────────────────── */
async function loadStatus() {
  try {
    const res = await fetch(`/api/ponto/status/${funcionario.id}`);
    status = await res.json();
    renderStatus();
  } catch {
    $('status-label').innerHTML = '<strong>Erro ao carregar status.</strong>';
  }
}

function renderStatus() {
  clearTimer();
  clearCooldown();
  renderTimeline(status.registros);
  renderButtons(status.permitidos);

  const ul  = status.ultimo;
  const lbl = $('status-label');

  if (!ul)
    lbl.innerHTML = 'Bom dia! <strong>Registre sua entrada.</strong>';
  else if (ul === 'entrada') {
    lbl.innerHTML = 'Trabalhando. <strong>Intervalo ou saída?</strong>';
    startTimer(status.registros.find(r => r.tipo === 'entrada')?.hora);
  }
  else if (ul === 'intervalo')
    lbl.innerHTML = 'Em intervalo. <strong>Registre o retorno.</strong>';
  else if (ul === 'retorno') {
    lbl.innerHTML = 'Trabalhando. <strong>Registre a saída quando finalizar.</strong>';
    startTimer(status.registros.find(r => r.tipo === 'entrada')?.hora, status.registros);
  }
  else if (ul === 'saida') {
    if (status.cooldown_seg > 0) {
      startCooldown(status.cooldown_seg);
    } else {
      lbl.innerHTML = 'Jornada encerrada. <strong>Nova entrada disponível!</strong>';
    }
  }
}

function renderTimeline(registros) {
  const labels = { entrada:'Entrada', intervalo:'Intervalo', retorno:'Retorno', saida:'Saída' };
  $('timeline').innerHTML = registros.map(r => `
    <div class="timeline-item">
      <span class="tl-dot ${r.tipo}"></span>
      <span class="tl-tipo">${labels[r.tipo] || r.tipo}</span>
      <span class="tl-hora">${r.hora.slice(0,5)}</span>
    </div>`).join('');
}

function renderButtons(permitidos) {
  document.querySelectorAll('.punch-btn').forEach(btn => {
    const ok = permitidos.includes(btn.dataset.tipo);
    btn.disabled = !ok;
    btn.classList.toggle('active', ok);
  });
}

/* ── Timer ──────────────────────────────────────────────────────── */
function startTimer(entradaHoraStr, registros) {
  if (!entradaHoraStr) return;
  $('status-timer').classList.remove('hidden');
  function tick() {
    const now = new Date();
    const [h, m, s] = entradaHoraStr.split(':').map(Number);
    let diff = Math.floor((now - new Date().setHours(h, m, s, 0)) / 1000);
    if (registros) {
      const iv = registros.find(r => r.tipo === 'intervalo');
      const rt = registros.find(r => r.tipo === 'retorno');
      if (iv && rt) {
        const [ih,im,is_] = iv.hora.split(':').map(Number);
        const [rh,rm,rs]  = rt.hora.split(':').map(Number);
        diff -= (rh*3600+rm*60+rs) - (ih*3600+im*60+is_);
      }
    }
    $('status-timer').textContent = formatHMS(Math.max(0, diff));
  }
  tick();
  timerInterval = setInterval(tick, 1000);
}

function clearTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  $('status-timer').classList.add('hidden');
  $('status-timer').textContent = '';
}

/* ── Cooldown (após saída) ──────────────────────────────────────── */
function startCooldown(segundosRestantes) {
  const lbl   = $('status-label');
  const timer = $('status-timer');
  let restante = segundosRestantes;

  function tick() {
    if (restante <= 0) {
      clearCooldown();
      loadStatus(); // recarrega e libera o botão de entrada
      return;
    }
    const h = Math.floor(restante / 3600);
    const m = Math.floor((restante % 3600) / 60);
    const s = restante % 60;
    lbl.innerHTML = 'Saída registrada. <strong>Aguarde para nova entrada:</strong>';
    timer.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    timer.classList.remove('hidden');
    restante--;
  }

  tick();
  cooldownInterval = setInterval(tick, 1000);
}

function clearCooldown() {
  clearInterval(cooldownInterval);
  cooldownInterval = null;
}

/* ── Punch actions ──────────────────────────────────────────────── */
async function onPunchClick(tipo) {
  $('punch-error').classList.add('hidden');
  if (tipo === 'saida') { abrirModalSaida(); return; }
  try {
    const res = await fetch('/api/ponto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funcionario_id: funcionario.id, tipo })
    });
    const data = await res.json();
    if (!res.ok) { showPunchError(data.error); return; }
    showToast(`${tipoLabel(tipo)} registrada às ${data.hora.slice(0,5)}`);
    await loadStatus();
  } catch {
    showPunchError('Erro de conexão.');
  }
}

/* ── Saída modal ────────────────────────────────────────────────── */
function abrirModalSaida() {
  $('saida-obs').value = '';
  $('saida-error').classList.add('hidden');
  capturedBlob = null;
  mostrarEstadoCam('idle');
  $('modal-saida').classList.remove('hidden');
}

function fecharModalSaida() {
  fecharCamera();
  $('modal-saida').classList.add('hidden');
}

async function confirmarSaida() {
  const obs = $('saida-obs').value.trim();
  $('saida-error').classList.add('hidden');
  if (!capturedBlob) { showSaidaError('Tire uma foto da produção antes de confirmar.'); return; }
  if (!obs)          { showSaidaError('Adicione uma observação.'); return; }

  const fd = new FormData();
  fd.append('funcionario_id', funcionario.id);
  fd.append('observacao', obs);
  fd.append('foto', capturedBlob, `saida_${Date.now()}.jpg`);

  const btn = $('btn-saida-confirmar');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    const res  = await fetch('/api/ponto/saida', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) { showSaidaError(data.error); return; }
    fecharModalSaida();
    showToast(`Saída registrada às ${data.hora.slice(0,5)}`);
    await loadStatus();
  } catch {
    showSaidaError('Erro de conexão.');
  } finally {
    btn.disabled = false; btn.textContent = 'Confirmar Saída';
  }
}

/* ── Camera ─────────────────────────────────────────────────────── */
function getUserMediaDisponivel() {
  // getUserMedia só funciona em contexto seguro (HTTPS ou localhost)
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

async function abrirCamera() {
  if (!getUserMediaDisponivel()) {
    // HTTP mobile: dispara o input com capture="environment" (câmera direta, sem galeria)
    const inp = $('cam-input-fallback');
    inp.onchange = () => {
      const file = inp.files[0];
      if (!file) return;
      capturedBlob = file;
      $('cam-foto-preview').src = URL.createObjectURL(file);
      mostrarEstadoCam('captured');
    };
    inp.click();
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    const video = $('cam-video');
    video.srcObject = cameraStream;
    mostrarEstadoCam('live');
  } catch (err) {
    showSaidaError('Câmera negada. Verifique as permissões do navegador.');
  }
}

function capturarFoto() {
  const video  = $('cam-video');
  const canvas = $('cam-canvas');
  canvas.width  = video.videoWidth  || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    capturedBlob = blob;
    $('cam-foto-preview').src = URL.createObjectURL(blob);
    fecharCamera();
    mostrarEstadoCam('captured');
  }, 'image/jpeg', 0.88);
}

function fecharCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

function retirarNovamente() {
  capturedBlob = null;
  // Limpa o input de fallback para permitir selecionar nova foto
  const inp = $('cam-input-fallback');
  inp.value = '';
  mostrarEstadoCam('idle');
}

function mostrarEstadoCam(estado) {
  ['idle','live','captured'].forEach(s =>
    $(`cam-${s}`).classList.toggle('hidden', s !== estado)
  );
}

/* ── Helpers ────────────────────────────────────────────────────── */
function showScreen(name) {
  $('screen-setup').classList.toggle('active', name === 'setup');
  $('screen-login').classList.toggle('active', name === 'login');
  $('screen-ponto').classList.toggle('active', name === 'ponto');
}

function showLoginError(msg) { const el = $('login-error'); el.textContent = msg; el.classList.remove('hidden'); }
function showPunchError(msg) { const el = $('punch-error'); el.textContent = msg; el.classList.remove('hidden'); }
function showSaidaError(msg) { const el = $('saida-error'); el.textContent = msg; el.classList.remove('hidden'); }

function showToast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

function tipoLabel(tipo) {
  return { entrada:'Entrada', intervalo:'Intervalo', retorno:'Retorno', saida:'Saída' }[tipo] || tipo;
}

function formatHHMMSS(date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => String(n).padStart(2,'0')).join(':');
}

function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
