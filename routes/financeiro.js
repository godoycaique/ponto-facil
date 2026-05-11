const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/database');

// ── Helpers ────────────────────────────────────────────────────────
function calcularMinutos(registros) {
  const m = {};
  registros.forEach(r => { m[r.tipo] = r; });
  if (!m.entrada || !m.saida) return 0;
  const toSec = h => { const [hh,mm,ss] = h.split(':').map(Number); return hh*3600+mm*60+(ss||0); };
  let total = toSec(m.saida.hora) - toSec(m.entrada.hora);
  if (m.intervalo && m.retorno) total -= toSec(m.retorno.hora) - toSec(m.intervalo.hora);
  return Math.max(0, Math.floor(total / 60));
}

function valorDia(totalMinutos, valorHora) {
  return Math.round((totalMinutos / 60) * valorHora * 100) / 100;
}

// ── Em aberto ──────────────────────────────────────────────────────
// GET /api/financeiro/abertos?funcionario_id=X&data_inicio=Y&data_fim=Z
router.get('/abertos', (req, res) => {
  const db = getDb();
  const { funcionario_id, data_inicio, data_fim } = req.query;

  let fWhere = 'WHERE ativo = 1';
  const fParams = [];
  if (funcionario_id) { fWhere += ' AND id = ?'; fParams.push(funcionario_id); }

  const funcionarios = db.prepare(
    `SELECT id, codigo, nome, valor_hora FROM funcionarios ${fWhere} ORDER BY nome`
  ).all(...fParams);

  const resultado = funcionarios.map(f => {
    let dWhere = `
      WHERE r.funcionario_id = ?
        AND r.tipo = 'saida'
        AND r.data NOT IN (
          SELECT fi.data FROM fechamento_itens fi WHERE fi.funcionario_id = ?
        )
    `;
    const dParams = [f.id, f.id];
    if (data_inicio) { dWhere += ' AND r.data >= ?'; dParams.push(data_inicio); }
    if (data_fim)    { dWhere += ' AND r.data <= ?'; dParams.push(data_fim); }

    const datas = db.prepare(
      `SELECT DISTINCT r.data FROM registros r ${dWhere} ORDER BY r.data ASC`
    ).all(...dParams);

    const dias = datas.map(({ data }) => {
      const regs = db.prepare(
        'SELECT tipo, hora FROM registros WHERE funcionario_id = ? AND data = ? ORDER BY criado_em ASC'
      ).all(f.id, data);
      const total_minutos = calcularMinutos(regs);
      const valor = valorDia(total_minutos, f.valor_hora);
      return { data, total_minutos, valor };
    }).filter(d => d.total_minutos >= 30);

    const total_valor = dias.reduce((s, d) => s + d.valor, 0);
    return { funcionario: f, dias, total_valor };
  }).filter(f => f.dias.length > 0);

  res.json(resultado);
});

// ── Fechamentos ────────────────────────────────────────────────────
// GET /api/financeiro/fechamentos
router.get('/fechamentos', (req, res) => {
  const db = getDb();
  const lista = db.prepare(`
    SELECT
      fe.id, fe.descricao, fe.data_pagamento, fe.status, fe.criado_em,
      COUNT(DISTINCT fi.funcionario_id) AS num_funcionarios,
      COUNT(fi.id) AS num_dias,
      MIN(fi.data) AS data_inicio,
      MAX(fi.data) AS data_fim,
      SUM((fi.total_minutos / 60.0) * fi.valor_hora) AS total_valor
    FROM fechamentos fe
    LEFT JOIN fechamento_itens fi ON fi.fechamento_id = fe.id
    GROUP BY fe.id
    ORDER BY fe.criado_em DESC
  `).all();
  res.json(lista);
});

// GET /api/financeiro/fechamentos/:id (detail)
router.get('/fechamentos/:id', (req, res) => {
  const db = getDb();
  const fe = db.prepare('SELECT * FROM fechamentos WHERE id = ?').get(req.params.id);
  if (!fe) return res.status(404).json({ error: 'Fechamento não encontrado.' });

  const itens = db.prepare(`
    SELECT fi.*, f.nome, f.codigo,
           ROUND((fi.total_minutos / 60.0) * fi.valor_hora, 2) AS valor
    FROM fechamento_itens fi
    JOIN funcionarios f ON f.id = fi.funcionario_id
    WHERE fi.fechamento_id = ?
    ORDER BY f.nome ASC, fi.data ASC
  `).all(req.params.id);

  // Group by employee
  const porFunc = {};
  itens.forEach(item => {
    if (!porFunc[item.funcionario_id]) {
      porFunc[item.funcionario_id] = { nome: item.nome, codigo: item.codigo, dias: [], total_valor: 0 };
    }
    porFunc[item.funcionario_id].dias.push(item);
    porFunc[item.funcionario_id].total_valor += item.valor;
  });

  const total_valor = itens.reduce((s, i) => s + i.valor, 0);
  res.json({ ...fe, funcionarios: Object.values(porFunc), total_valor });
});

// POST /api/financeiro/fechamentos — create
router.post('/fechamentos', (req, res) => {
  const db = getDb();
  const { descricao, data_pagamento, itens } = req.body;
  if (!itens || !itens.length) return res.status(400).json({ error: 'Selecione ao menos um dia.' });

  const fe = db.prepare(
    'INSERT INTO fechamentos (descricao, data_pagamento) VALUES (?, ?)'
  ).run(descricao || null, data_pagamento || null);

  const insertItem = db.prepare(
    'INSERT INTO fechamento_itens (fechamento_id, funcionario_id, data, total_minutos, valor_hora) VALUES (?, ?, ?, ?, ?)'
  );

  const erros = [];
  for (const item of itens) {
    const regs = db.prepare(
      'SELECT tipo, hora FROM registros WHERE funcionario_id = ? AND data = ? ORDER BY criado_em ASC'
    ).all(item.funcionario_id, item.data);
    const total_minutos = calcularMinutos(regs);
    const func = db.prepare('SELECT valor_hora FROM funcionarios WHERE id = ?').get(item.funcionario_id);
    try {
      insertItem.run(fe.lastInsertRowid, item.funcionario_id, item.data, total_minutos, func?.valor_hora || 0);
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        erros.push(`${item.data} já está em outro fechamento.`);
      } else throw e;
    }
  }

  if (erros.length) {
    return res.status(409).json({ error: erros.join(' ') });
  }

  res.json({ id: fe.lastInsertRowid });
});

// PUT /api/financeiro/fechamentos/:id/pagar — mark as paid
router.put('/fechamentos/:id/pagar', (req, res) => {
  const db = getDb();
  const { data_pagamento } = req.body;
  if (!data_pagamento) return res.status(400).json({ error: 'Informe a data de pagamento.' });

  const fe = db.prepare('SELECT id, status FROM fechamentos WHERE id = ?').get(req.params.id);
  if (!fe)              return res.status(404).json({ error: 'Fechamento não encontrado.' });
  if (fe.status === 'pago') return res.status(409).json({ error: 'Fechamento já está pago.' });

  db.prepare("UPDATE fechamentos SET status = 'pago', data_pagamento = ? WHERE id = ?")
    .run(data_pagamento, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/financeiro/fechamentos/:id — remove if still pending
router.delete('/fechamentos/:id', (req, res) => {
  const db = getDb();
  const fe = db.prepare('SELECT id, status FROM fechamentos WHERE id = ?').get(req.params.id);
  if (!fe) return res.status(404).json({ error: 'Fechamento não encontrado.' });
  if (fe.status === 'pago') return res.status(409).json({ error: 'Não é possível excluir um fechamento pago.' });

  db.prepare('DELETE FROM fechamento_itens WHERE fechamento_id = ?').run(req.params.id);
  db.prepare('DELETE FROM fechamentos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
