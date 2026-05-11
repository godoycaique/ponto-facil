/* ── DOM helpers ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── Tab navigation ─────────────────────────────────────────────── */
document.querySelectorAll('.nav-item[data-tab]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const tab = link.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    link.classList.add('active');
    $(`tab-${tab}`).classList.add('active');
    if (tab === 'resumo')          loadResumo();
    if (tab === 'registros')       loadRegistros();
    if (tab === 'funcionarios')    loadFuncionarios();
    if (tab === 'financeiro')      loadFinanceiro();
    if (tab === 'configuracoes')   loadConfiguracoes();
  });
});

/* ── Init ───────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  // Load company name
  try {
    const cfg = await (await fetch('/api/config')).json();
    if (cfg.empresa) {
      document.title = cfg.empresa + ' — Painel';
      $('admin-empresa-nome').textContent = cfg.empresa;
      $('cfg-empresa').value = cfg.empresa;
    }
  } catch {}

  const today = todayStr();
  $('resumo-data').value = today;
  $('reg-data').value    = today;
  $('exp-inicio').value  = today;
  $('exp-fim').value     = today;

  loadResumo();
  loadFuncionariosSelects();

  $('resumo-data').addEventListener('change', loadResumo);
  $('reg-data').addEventListener('change', loadRegistros);
  $('reg-funcionario').addEventListener('change', loadRegistros);

  // Funcionários modal
  $('btn-novo-func').addEventListener('click', () => openFuncModal(null));
  $('btn-func-cancelar').addEventListener('click', () => $('modal-func').classList.add('hidden'));
  $('btn-func-salvar').addEventListener('click', saveFuncionario);
  $('func-prefixo').addEventListener('input', onPrefixoInput);

  // Edit registro modal
  $('btn-reg-cancelar').addEventListener('click', () => $('modal-reg').classList.add('hidden'));
  $('btn-reg-salvar').addEventListener('click', saveRegistroEdit);

  // Export
  $('btn-exportar').addEventListener('click', exportCSV);

  // Financeiro
  $('btn-filtrar-fin').addEventListener('click', loadFinanceiro);
  $('btn-criar-fechamento').addEventListener('click', abrirModalFechamento);
  $('chk-todos-abertos').addEventListener('change', toggleTodosAbertos);
  $('btn-fech-cancelar').addEventListener('click', () => $('modal-fechamento').classList.add('hidden'));
  $('btn-fech-confirmar').addEventListener('click', criarFechamento);
  $('btn-fech-det-fechar').addEventListener('click', () => $('modal-fech-det').classList.add('hidden'));
  $('btn-fech-pagar').addEventListener('click', pagarFechamento);
  $('btn-fech-det-excluir').addEventListener('click', excluirFechamento);

  // Configurações
  $('btn-cfg-salvar').addEventListener('click', salvarConfiguracoes);

  // Lightbox
  $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightbox').classList.add('hidden'); });
  $('lightbox-close').addEventListener('click', () => $('lightbox').classList.add('hidden'));
});

/* ── Resumo ─────────────────────────────────────────────────────── */
async function loadResumo() {
  const data = $('resumo-data').value;
  const grid = $('resumo-grid');
  grid.innerHTML = '<p style="color:var(--c-muted);padding:8px">Carregando...</p>';
  try {
    const items = await (await fetch(`/api/admin/resumo?data=${data}`)).json();
    if (!items.length) { grid.innerHTML = '<p style="color:var(--c-muted);padding:8px">Nenhum funcionário cadastrado.</p>'; return; }
    grid.innerHTML = items.map(item => {
      const punch = (tipo, label, color) => {
        const val = item[tipo];
        return `<div class="punch-row ${val ? '' : 'missing'}">
          <span class="dot" style="background:${color}"></span>
          <span class="label">${label}</span>
          <span class="value">${val ? val.slice(0,5) : '—'}</span>
        </div>`;
      };
      const total = item.total_minutos != null
        ? `<strong>${Math.floor(item.total_minutos / 60)}h ${item.total_minutos % 60}min trabalhadas</strong>`
        : 'Jornada em andamento';
      const foto = item.foto
        ? `<div class="thumb-link"><a href="/${item.foto}" target="_blank" onclick="openLightbox(event,'/${item.foto}')"><img src="/${item.foto}" alt="foto" /></a></div>`
        : '';
      return `
        <div class="resumo-card">
          <div class="resumo-nome">${escapeHtml(item.funcionario.nome)}</div>
          <div class="resumo-codigo">${escapeHtml(item.funcionario.codigo)}</div>
          <div class="resumo-punches">
            ${punch('entrada',  'Entrada',  'var(--c-entrada)')}
            ${punch('intervalo','Intervalo','var(--c-intervalo)')}
            ${punch('retorno',  'Retorno',  'var(--c-retorno)')}
            ${punch('saida',    'Saída',    'var(--c-saida)')}
          </div>
          <div class="resumo-total">${total}</div>
          ${item.observacao ? `<div class="resumo-obs">"${escapeHtml(item.observacao)}"</div>` : ''}
          ${foto}
        </div>`;
    }).join('');
  } catch {
    grid.innerHTML = '<p style="color:var(--c-muted)">Erro ao carregar.</p>';
  }
}

/* ── Registros table ─────────────────────────────────────────────── */
async function loadRegistros() {
  const data  = $('reg-data').value;
  const fid   = $('reg-funcionario').value;
  const tbody = $('registros-tbody');
  tbody.innerHTML = '<tr><td colspan="8" style="color:var(--c-muted);text-align:center;padding:20px">Carregando...</td></tr>';
  try {
    let url = `/api/admin/registros?data=${data}`;
    if (fid) url += `&funcionario_id=${fid}`;
    const rows = await (await fetch(url)).json();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="color:var(--c-muted);text-align:center;padding:20px">Nenhum registro.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.nome)}</td>
        <td>${escapeHtml(r.codigo)}</td>
        <td>${r.data}</td>
        <td>${r.hora.slice(0,5)}</td>
        <td><span class="badge ${r.tipo}">${tipoLabel(r.tipo)}</span></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.observacao ? escapeHtml(r.observacao) : '<span style="color:var(--c-muted)">—</span>'}</td>
        <td>${r.foto_path
          ? `<a href="/${r.foto_path}" target="_blank" onclick="openLightbox(event,'/${r.foto_path}')">
               <img src="/${r.foto_path}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--c-border)" />
             </a>`
          : '<span style="color:var(--c-muted)">—</span>'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick='openRegEdit(${JSON.stringify({id:r.id, hora:r.hora, tipo:r.tipo, observacao:r.observacao||""})})'>Editar</button></td>
      </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="8" style="color:var(--c-muted)">Erro ao carregar.</td></tr>';
  }
}

/* ── Edit registro ───────────────────────────────────────────────── */
function openRegEdit(r) {
  $('reg-edit-id').value   = r.id;
  $('reg-edit-hora').value = r.hora.slice(0,5);
  $('reg-edit-tipo').value = tipoLabel(r.tipo);
  $('reg-edit-obs').value  = r.observacao || '';
  $('reg-edit-obs').disabled = r.tipo !== 'saida';
  $('reg-edit-error').classList.add('hidden');
  $('modal-reg').classList.remove('hidden');
}

async function saveRegistroEdit() {
  const id  = $('reg-edit-id').value;
  const hora = $('reg-edit-hora').value;
  const obs  = $('reg-edit-obs').value.trim();
  $('reg-edit-error').classList.add('hidden');

  if (!hora) { showRegError('Informe a hora.'); return; }

  try {
    const res  = await fetch(`/api/admin/registros/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hora, observacao: obs || null })
    });
    const data = await res.json();
    if (!res.ok) { showRegError(data.error); return; }
    $('modal-reg').classList.add('hidden');
    showToast('Registro atualizado.');
    loadRegistros();
    loadResumo();
  } catch {
    showRegError('Erro de conexão.');
  }
}

/* ── Funcionários ───────────────────────────────────────────────── */
async function loadFuncionarios() {
  const tbody = $('func-tbody');
  tbody.innerHTML = '';
  try {
    const list = await (await fetch('/api/funcionarios')).json();
    tbody.innerHTML = list.map(f => `
      <tr>
        <td>${escapeHtml(f.codigo)}</td>
        <td>${escapeHtml(f.nome)}</td>
        <td>${brl(f.valor_hora || 0)}/h</td>
        <td><span class="badge ${f.ativo ? 'ativo' : 'inativo'}">${f.ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick='openFuncModal(${JSON.stringify(f)})'>Editar</button>
          ${f.ativo
            ? `<button class="btn btn-ghost btn-sm" style="color:var(--c-saida)" onclick="desativarFunc(${f.id})">Desativar</button>`
            : `<button class="btn btn-ghost btn-sm" style="color:var(--c-success)" onclick="ativarFunc(${f.id},${JSON.stringify(f)})">Ativar</button>`}
        </td>
      </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--c-muted)">Erro ao carregar.</td></tr>';
  }
}

async function loadFuncionariosSelects() {
  try {
    const list = await (await fetch('/api/funcionarios')).json();
    const opts = list.map(f => `<option value="${f.id}">${escapeHtml(f.nome)} (${escapeHtml(f.codigo)})</option>`).join('');
    ['reg-funcionario', 'exp-funcionario', 'fin-funcionario'].forEach(id => {
      const sel = $(id);
      if (!sel) return;
      const first = sel.options[0].outerHTML;
      sel.innerHTML = first + opts;
    });
  } catch {}
}

async function openFuncModal(f) {
  $('func-id').value   = f ? f.id : '';
  $('func-nome').value = f ? f.nome : '';
  $('modal-func-title').textContent = f ? 'Editar funcionário' : 'Novo funcionário';
  $('func-error').classList.add('hidden');

  if (f) {
    // editing: split existing code into prefix + number
    const match = f.codigo.match(/^([A-Z]+)(\d+)$/);
    $('func-prefixo').value      = match ? match[1] : f.codigo;
    $('func-codigo').value       = match ? match[2] : '';
    $('func-valor-hora').value   = f.valor_hora || '';
    $('func-codigo-hint').textContent = `Código atual: ${f.codigo}`;
    $('func-prefixo').disabled = false;
  } else {
    $('func-valor-hora').value = '';
    // new: auto-suggest next code for default prefix
    const prefixo = $('func-prefixo').value || 'GW';
    await preencherProximoCodigo(prefixo);
  }

  $('modal-func').classList.remove('hidden');
  $('func-nome').focus();
}

async function onPrefixoInput() {
  const prefixo = $('func-prefixo').value.trim().toUpperCase();
  $('func-prefixo').value = prefixo;
  if (!$('func-id').value && prefixo.length >= 1) {
    await preencherProximoCodigo(prefixo);
  }
}

async function preencherProximoCodigo(prefixo) {
  try {
    const { proximo } = await (await fetch(`/api/funcionarios/proximo-codigo?prefixo=${encodeURIComponent(prefixo)}`)).json();
    const match = proximo.match(/^([A-Z]+)(\d+)$/);
    $('func-codigo').value = match ? match[2] : proximo;
    $('func-codigo-hint').textContent = `Próximo sugerido: ${proximo}`;
  } catch {}
}

async function saveFuncionario() {
  const id         = $('func-id').value;
  const prefixo    = $('func-prefixo').value.trim().toUpperCase();
  const num        = $('func-codigo').value.trim();
  const codigo     = (prefixo + num).toUpperCase();
  const nome       = $('func-nome').value.trim();
  const valor_hora = parseFloat($('func-valor-hora').value) || 0;
  $('func-error').classList.add('hidden');

  if (!codigo || !nome) { showFuncError('Preencha código e nome.'); return; }

  try {
    const res  = await fetch(id ? `/api/funcionarios/${id}` : '/api/funcionarios', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, nome, ativo: 1, valor_hora })
    });
    const data = await res.json();
    if (!res.ok) { showFuncError(data.error); return; }
    $('modal-func').classList.add('hidden');
    showToast(id ? 'Funcionário atualizado.' : 'Funcionário cadastrado.');
    loadFuncionarios();
    loadFuncionariosSelects();
  } catch {
    showFuncError('Erro de conexão.');
  }
}

async function desativarFunc(id) {
  if (!confirm('Desativar este funcionário?')) return;
  await fetch(`/api/funcionarios/${id}`, { method: 'DELETE' });
  loadFuncionarios();
}

async function ativarFunc(id, f) {
  await fetch(`/api/funcionarios/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: f.codigo, nome: f.nome, ativo: 1 })
  });
  loadFuncionarios();
}

/* ── Export ─────────────────────────────────────────────────────── */
function exportCSV() {
  const inicio = $('exp-inicio').value;
  const fim    = $('exp-fim').value;
  const fid    = $('exp-funcionario').value;
  let url = `/api/admin/exportar?data_inicio=${inicio}&data_fim=${fim}`;
  if (fid) url += `&funcionario_id=${fid}`;
  window.open(url, '_blank');
}

/* ── Lightbox ───────────────────────────────────────────────────── */
function openLightbox(e, src) {
  e.preventDefault();
  $('lightbox-img').src = src;
  $('lightbox').classList.remove('hidden');
}

/* ── Helpers ────────────────────────────────────────────────────── */
function tipoLabel(tipo) {
  return { entrada:'Entrada', intervalo:'Intervalo', retorno:'Retorno', saida:'Saída' }[tipo] || tipo;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function showToast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

/* ── Configurações ──────────────────────────────────────────────── */
function loadConfiguracoes() {
  // input já preenchido no DOMContentLoaded; nada extra a fazer
}

async function salvarConfiguracoes() {
  const empresa = $('cfg-empresa').value.trim();
  $('cfg-error').classList.add('hidden');
  if (!empresa) { $('cfg-error').textContent = 'Informe o nome da empresa.'; $('cfg-error').classList.remove('hidden'); return; }

  try {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa })
    });
    if (!res.ok) { const d = await res.json(); $('cfg-error').textContent = d.error; $('cfg-error').classList.remove('hidden'); return; }
    document.title = empresa + ' — Painel';
    $('admin-empresa-nome').textContent = empresa;
    showToast('Configurações salvas.');
  } catch {
    $('cfg-error').textContent = 'Erro de conexão.';
    $('cfg-error').classList.remove('hidden');
  }
}

function showFuncError(msg) { $('func-error').textContent = msg; $('func-error').classList.remove('hidden'); }
function showRegError(msg)  { $('reg-edit-error').textContent = msg; $('reg-edit-error').classList.remove('hidden'); }

/* ════════════════════════════════════════════════════════════════
   FINANCEIRO
════════════════════════════════════════════════════════════════ */

// selectedDays: Map of key `${fid}_${data}` → {funcionario_id, data, total_minutos, valor_hora, nome, valor}
let selectedDays = new Map();

async function loadFinanceiro() {
  await Promise.all([loadAbertos(), loadFechamentos()]);
}

/* ── Em aberto ──────────────────────────────────────────────────── */
async function loadAbertos() {
  const fid    = $('fin-funcionario').value;
  const inicio = $('fin-inicio').value;
  const fim    = $('fin-fim').value;
  const tbody  = $('abertos-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--c-muted);padding:20px">Carregando...</td></tr>';
  selectedDays.clear();
  atualizarBotaoFechamento();

  let url = '/api/financeiro/abertos';
  const params = [];
  if (fid)    params.push(`funcionario_id=${fid}`);
  if (inicio) params.push(`data_inicio=${inicio}`);
  if (fim)    params.push(`data_fim=${fim}`);
  if (params.length) url += '?' + params.join('&');

  try {
    const lista = await (await fetch(url)).json();

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--c-muted);padding:20px">Nenhum dia em aberto.</td></tr>';
      $('chk-todos-abertos').checked = false;
      return;
    }

    let rows = '';
    lista.forEach(item => {
      item.dias.forEach(dia => {
        const key = `${item.funcionario.id}_${dia.data}`;
        const h = Math.floor(dia.total_minutos / 60);
        const m = dia.total_minutos % 60;
        rows += `
          <tr data-key="${key}">
            <td><input type="checkbox" class="chk-dia" data-key="${key}"
              data-fid="${item.funcionario.id}" data-data="${dia.data}"
              data-min="${dia.total_minutos}" data-vh="${item.funcionario.valor_hora}"
              data-nome="${escapeHtml(item.funcionario.nome)}"
              data-valor="${dia.valor}" /></td>
            <td>${escapeHtml(item.funcionario.nome)} <small style="color:var(--c-muted)">${escapeHtml(item.funcionario.codigo)}</small></td>
            <td>${formatData(dia.data)}</td>
            <td>${h}h${m > 0 ? ` ${m}min` : ''}</td>
            <td>${brl(item.funcionario.valor_hora)}</td>
            <td><strong>${brl(dia.valor)}</strong></td>
          </tr>`;
      });
    });
    tbody.innerHTML = rows;

    // Wire up individual checkboxes
    tbody.querySelectorAll('.chk-dia').forEach(chk => {
      chk.addEventListener('change', () => onDiaCheck(chk));
    });
    $('chk-todos-abertos').checked = false;
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--c-muted)">Erro ao carregar.</td></tr>';
  }
}

function onDiaCheck(chk) {
  const key = chk.dataset.key;
  if (chk.checked) {
    selectedDays.set(key, {
      funcionario_id: Number(chk.dataset.fid),
      data:           chk.dataset.data,
      total_minutos:  Number(chk.dataset.min),
      valor_hora:     Number(chk.dataset.vh),
      nome:           chk.dataset.nome,
      valor:          Number(chk.dataset.valor),
    });
  } else {
    selectedDays.delete(key);
  }
  atualizarBotaoFechamento();
}

function toggleTodosAbertos() {
  const checked = $('chk-todos-abertos').checked;
  document.querySelectorAll('.chk-dia').forEach(chk => {
    chk.checked = checked;
    onDiaCheck(chk);
  });
}

function atualizarBotaoFechamento() {
  const n     = selectedDays.size;
  const total = [...selectedDays.values()].reduce((s, d) => s + d.valor, 0);
  $('fech-sel-info').textContent = `${n} dia${n !== 1 ? 's' : ''} · ${brl(total)}`;
  $('btn-criar-fechamento').disabled = n === 0;
}

/* ── Criar fechamento ────────────────────────────────────────────── */
function abrirModalFechamento() {
  if (!selectedDays.size) return;
  $('fech-descricao').value   = '';
  $('fech-data-pgto').value   = '';
  $('fech-error').classList.add('hidden');

  // Build summary grouped by employee
  const porFunc = {};
  selectedDays.forEach(d => {
    if (!porFunc[d.nome]) porFunc[d.nome] = { dias: [], total: 0 };
    porFunc[d.nome].dias.push(d);
    porFunc[d.nome].total += d.valor;
  });
  const grandTotal = [...selectedDays.values()].reduce((s, d) => s + d.valor, 0);

  let html = '<div class="fech-resumo-lista">';
  Object.entries(porFunc).forEach(([nome, g]) => {
    html += `<div class="fech-resumo-func">
      <div class="fech-resumo-func-nome">${escapeHtml(nome)}</div>
      ${g.dias.map(d => {
        const h = Math.floor(d.total_minutos/60), m = d.total_minutos%60;
        return `<div class="fech-resumo-linha">
          <span>${formatData(d.data)}</span>
          <span>${h}h${m>0?` ${m}min`:''}</span>
          <span>${brl(d.valor)}</span>
        </div>`;
      }).join('')}
      <div class="fech-resumo-subtotal">Subtotal: <strong>${brl(g.total)}</strong></div>
    </div>`;
  });
  html += `</div><div class="fech-grand-total">Total geral: <strong>${brl(grandTotal)}</strong></div>`;
  $('fech-resumo').innerHTML = html;

  $('modal-fechamento').classList.remove('hidden');
}

async function criarFechamento() {
  const descricao    = $('fech-descricao').value.trim();
  const data_pagamento = $('fech-data-pgto').value;
  $('fech-error').classList.add('hidden');

  const itens = [...selectedDays.values()].map(d => ({
    funcionario_id: d.funcionario_id,
    data: d.data
  }));

  try {
    const res  = await fetch('/api/financeiro/fechamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descricao, data_pagamento: data_pagamento || null, itens })
    });
    const data = await res.json();
    if (!res.ok) { $('fech-error').textContent = data.error; $('fech-error').classList.remove('hidden'); return; }
    $('modal-fechamento').classList.add('hidden');
    selectedDays.clear();
    atualizarBotaoFechamento();
    showToast('Fechamento criado com sucesso!');
    loadFinanceiro();
  } catch {
    $('fech-error').textContent = 'Erro de conexão.';
    $('fech-error').classList.remove('hidden');
  }
}

/* ── Histórico de fechamentos ────────────────────────────────────── */
async function loadFechamentos() {
  const tbody = $('fechamentos-tbody');
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--c-muted);padding:20px">Carregando...</td></tr>';
  try {
    const lista = await (await fetch('/api/financeiro/fechamentos')).json();
    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--c-muted);padding:20px">Nenhum fechamento.</td></tr>';
      return;
    }
    tbody.innerHTML = lista.map(fe => {
      const periodo = fe.data_inicio
        ? `${formatData(fe.data_inicio)}${fe.data_inicio !== fe.data_fim ? ' → ' + formatData(fe.data_fim) : ''}`
        : '—';
      const statusBadge = fe.status === 'pago'
        ? '<span class="badge pago">Pago</span>'
        : '<span class="badge pendente">Pendente</span>';
      return `<tr>
        <td style="color:var(--c-muted)">#${fe.id}</td>
        <td>${escapeHtml(fe.descricao || '—')}</td>
        <td style="white-space:nowrap">${periodo}</td>
        <td>${fe.num_funcionarios}</td>
        <td>${fe.num_dias}</td>
        <td><strong>${brl(fe.total_valor || 0)}</strong></td>
        <td>${fe.data_pagamento ? formatData(fe.data_pagamento) : '<span style="color:var(--c-muted)">—</span>'}</td>
        <td>${statusBadge}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="abrirFechamentoDet(${fe.id})">Ver</button></td>
      </tr>`;
    }).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="9" style="color:var(--c-muted)">Erro ao carregar.</td></tr>';
  }
}

/* ── Detalhe / Pagar / Excluir ───────────────────────────────────── */
let fechamentoDetId = null;

async function abrirFechamentoDet(id) {
  fechamentoDetId = id;
  $('fech-det-error').classList.add('hidden');
  $('fech-det-content').innerHTML = 'Carregando...';
  $('modal-fech-det').classList.remove('hidden');

  try {
    const fe = await (await fetch(`/api/financeiro/fechamentos/${id}`)).json();

    $('fech-det-titulo').textContent = `Fechamento #${fe.id}${fe.descricao ? ' — ' + fe.descricao : ''}`;
    $('fech-det-sub').textContent    = `Criado em ${new Date(fe.criado_em).toLocaleDateString('pt-BR')}`;
    $('fech-det-badge').className    = `badge ${fe.status}`;
    $('fech-det-badge').textContent  = fe.status === 'pago' ? 'Pago' : 'Pendente';

    let html = '';
    fe.funcionarios.forEach(f => {
      html += `<div class="fech-det-func">
        <div class="fech-det-func-nome">${escapeHtml(f.nome)} <small>${escapeHtml(f.codigo)}</small></div>
        <table class="data-table" style="margin-top:6px;font-size:.85rem">
          <thead><tr><th>Data</th><th>Horas</th><th>Valor/h</th><th>Total</th></tr></thead>
          <tbody>
            ${f.dias.map(d => {
              const h = Math.floor(d.total_minutos/60), m = d.total_minutos%60;
              return `<tr>
                <td>${formatData(d.data)}</td>
                <td>${h}h${m>0?` ${m}min`:''}</td>
                <td>${brl(d.valor_hora)}</td>
                <td><strong>${brl(d.valor)}</strong></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div style="text-align:right;padding:6px 0;font-size:.88rem">Subtotal: <strong>${brl(f.total_valor)}</strong></div>
      </div>`;
    });
    html += `<div class="fech-grand-total">Total geral: <strong>${brl(fe.total_valor)}</strong></div>`;
    if (fe.status === 'pago' && fe.data_pagamento) {
      html += `<div style="color:var(--c-success);font-size:.88rem;margin-top:8px">Pago em ${formatData(fe.data_pagamento)}</div>`;
    }
    $('fech-det-content').innerHTML = html;

    // Show/hide pagar button
    const podePagar = fe.status === 'pendente';
    $('btn-fech-pagar').classList.toggle('hidden', !podePagar);
    $('fech-pagar-area').classList.toggle('hidden', !podePagar);
    $('btn-fech-det-excluir').classList.toggle('hidden', fe.status === 'pago');
    if (podePagar) $('fech-pagar-data').value = todayStr();
  } catch {
    $('fech-det-content').innerHTML = '<p style="color:var(--c-muted)">Erro ao carregar.</p>';
  }
}

async function pagarFechamento() {
  const data_pagamento = $('fech-pagar-data').value;
  $('fech-det-error').classList.add('hidden');
  if (!data_pagamento) { $('fech-det-error').textContent = 'Informe a data de pagamento.'; $('fech-det-error').classList.remove('hidden'); return; }

  try {
    const res  = await fetch(`/api/financeiro/fechamentos/${fechamentoDetId}/pagar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_pagamento })
    });
    const data = await res.json();
    if (!res.ok) { $('fech-det-error').textContent = data.error; $('fech-det-error').classList.remove('hidden'); return; }
    $('modal-fech-det').classList.add('hidden');
    showToast('Fechamento marcado como pago!');
    loadFechamentos();
  } catch {
    $('fech-det-error').textContent = 'Erro de conexão.';
    $('fech-det-error').classList.remove('hidden');
  }
}

async function excluirFechamento() {
  if (!confirm('Excluir este fechamento? Os dias voltarão a aparecer como "em aberto".')) return;
  try {
    const res  = await fetch(`/api/financeiro/fechamentos/${fechamentoDetId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { $('fech-det-error').textContent = data.error; $('fech-det-error').classList.remove('hidden'); return; }
    $('modal-fech-det').classList.add('hidden');
    showToast('Fechamento excluído.');
    loadFinanceiro();
  } catch {
    $('fech-det-error').textContent = 'Erro de conexão.';
    $('fech-det-error').classList.remove('hidden');
  }
}

/* ── Formatters ─────────────────────────────────────────────────── */
function brl(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatData(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
