const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// Next available code for a given prefix (e.g. GW → GW004)
router.get('/proximo-codigo', (req, res) => {
  const prefixo = (req.query.prefixo || 'GW').trim().toUpperCase();
  const db = getDb();
  const rows = db.prepare(
    "SELECT codigo FROM funcionarios WHERE codigo LIKE ? ORDER BY codigo"
  ).all(prefixo + '%');

  let max = 0;
  for (const { codigo } of rows) {
    const suffix = codigo.slice(prefixo.length);
    const n = parseInt(suffix, 10);
    if (!isNaN(n) && n > max) max = n;
  }
  const proximo = prefixo + String(max + 1).padStart(3, '0');
  res.json({ proximo });
});

// Get all active employees
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, codigo, nome, ativo, valor_hora FROM funcionarios ORDER BY nome').all();
  res.json(rows);
});

// Lookup employee by code
router.get('/codigo/:codigo', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT id, codigo, nome, ativo, valor_hora FROM funcionarios WHERE codigo = ?').get(req.params.codigo);
  if (!row) return res.status(404).json({ error: 'Funcionário não encontrado.' });
  if (!row.ativo) return res.status(403).json({ error: 'Funcionário inativo.' });
  res.json(row);
});

// Create employee
router.post('/', (req, res) => {
  const { codigo, nome, valor_hora } = req.body;
  if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios.' });
  const db = getDb();
  try {
    const result = db.prepare('INSERT INTO funcionarios (codigo, nome, valor_hora) VALUES (?, ?, ?)')
      .run(codigo.trim().toUpperCase(), nome.trim(), Number(valor_hora) || 0);
    res.json({ id: result.lastInsertRowid, codigo: codigo.trim().toUpperCase(), nome: nome.trim() });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Código já cadastrado.' });
    throw e;
  }
});

// Update employee
router.put('/:id', (req, res) => {
  const { codigo, nome, ativo, valor_hora } = req.body;
  const db = getDb();
  try {
    db.prepare('UPDATE funcionarios SET codigo = ?, nome = ?, ativo = ?, valor_hora = ? WHERE id = ?')
      .run(codigo.trim().toUpperCase(), nome.trim(), ativo ? 1 : 0, Number(valor_hora) || 0, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Código já cadastrado.' });
    throw e;
  }
});

// Delete employee
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE funcionarios SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
