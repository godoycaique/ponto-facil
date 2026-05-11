const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// All records with optional filters: ?data=YYYY-MM-DD&funcionario_id=X
router.get('/registros', (req, res) => {
  const db = getDb();
  const { data, funcionario_id } = req.query;

  let sql = `
    SELECT r.*, f.nome, f.codigo
    FROM registros r
    JOIN funcionarios f ON f.id = r.funcionario_id
    WHERE 1=1
  `;
  const params = [];

  if (data) { sql += ' AND r.data = ?'; params.push(data); }
  if (funcionario_id) { sql += ' AND r.funcionario_id = ?'; params.push(funcionario_id); }

  sql += ' ORDER BY r.data DESC, f.nome ASC, r.criado_em ASC';

  res.json(db.prepare(sql).all(...params));
});

// Daily summary: each employee's punches grouped
router.get('/resumo', (req, res) => {
  const db = getDb();
  const { data } = req.query;
  const hoje = data || todayStr();

  const funcionarios = db.prepare('SELECT id, codigo, nome FROM funcionarios WHERE ativo = 1 ORDER BY nome').all();

  const resultado = funcionarios.map(f => {
    const registros = db.prepare(
      'SELECT tipo, hora, observacao, foto_path FROM registros WHERE funcionario_id = ? AND data = ? ORDER BY criado_em ASC'
    ).all(f.id, hoje);

    const mapa = {};
    registros.forEach(r => { mapa[r.tipo] = r; });

    const entrada = mapa['entrada']?.hora || null;
    const intervalo = mapa['intervalo']?.hora || null;
    const retorno = mapa['retorno']?.hora || null;
    const saida = mapa['saida']?.hora || null;

    let totalMin = null;
    if (entrada && saida) {
      const [eh, em] = entrada.split(':').map(Number);
      const [sh, sm] = saida.split(':').map(Number);
      let total = (sh * 60 + sm) - (eh * 60 + em);
      if (intervalo && retorno) {
        const [ih, im] = intervalo.split(':').map(Number);
        const [rh, rm] = retorno.split(':').map(Number);
        total -= (rh * 60 + rm) - (ih * 60 + im);
      }
      totalMin = total;
    }

    return {
      funcionario: f,
      entrada,
      intervalo,
      retorno,
      saida,
      total_minutos: totalMin,
      observacao: mapa['saida']?.observacao || null,
      foto: mapa['saida']?.foto_path || null,
    };
  });

  res.json(resultado);
});

// Edit a record (hora and/or observacao)
router.put('/registros/:id', (req, res) => {
  const { hora, observacao } = req.body;
  if (!hora || !/^\d{2}:\d{2}(:\d{2})?$/.test(hora)) {
    return res.status(400).json({ error: 'Hora inválida. Use HH:MM ou HH:MM:SS.' });
  }
  const horaFmt = hora.length === 5 ? hora + ':00' : hora;
  const db = getDb();
  const row = db.prepare('SELECT id FROM registros WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Registro não encontrado.' });
  db.prepare('UPDATE registros SET hora = ?, observacao = ? WHERE id = ?')
    .run(horaFmt, observacao ?? null, req.params.id);
  res.json({ ok: true });
});

// CSV export
router.get('/exportar', (req, res) => {
  const db = getDb();
  const { data_inicio, data_fim, funcionario_id } = req.query;

  let sql = `
    SELECT r.data, r.hora, r.tipo, f.codigo, f.nome, r.observacao, r.foto_path
    FROM registros r
    JOIN funcionarios f ON f.id = r.funcionario_id
    WHERE 1=1
  `;
  const params = [];

  if (data_inicio) { sql += ' AND r.data >= ?'; params.push(data_inicio); }
  if (data_fim)    { sql += ' AND r.data <= ?'; params.push(data_fim); }
  if (funcionario_id) { sql += ' AND r.funcionario_id = ?'; params.push(funcionario_id); }

  sql += ' ORDER BY r.data ASC, f.nome ASC, r.criado_em ASC';

  const rows = db.prepare(sql).all(...params);

  const header = 'Data,Hora,Tipo,Código,Nome,Observação\n';
  const body = rows.map(r =>
    [r.data, r.hora, r.tipo, r.codigo, `"${r.nome}"`, `"${r.observacao || ''}"`].join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="registros.csv"');
  res.send('﻿' + header + body); // BOM for Excel
});

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = router;
