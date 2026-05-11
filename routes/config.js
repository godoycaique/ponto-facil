const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/database');

function getConfig(chave) {
  return getDb().prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave)?.valor ?? null;
}

function setConfig(chave, valor) {
  getDb().prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)').run(chave, valor);
}

// GET /api/config — retorna configurações públicas
router.get('/', (req, res) => {
  res.json({
    empresa:    getConfig('empresa')    || null,
    configurado: !!getConfig('empresa'),
  });
});

// POST /api/config/setup — primeira configuração
router.post('/setup', (req, res) => {
  const { empresa } = req.body;
  if (!empresa || !empresa.trim()) return res.status(400).json({ error: 'Nome da empresa é obrigatório.' });
  setConfig('empresa', empresa.trim());
  res.json({ ok: true, empresa: empresa.trim() });
});

// PUT /api/config — atualizar configurações
router.put('/', (req, res) => {
  const { empresa } = req.body;
  if (!empresa || !empresa.trim()) return res.status(400).json({ error: 'Nome da empresa é obrigatório.' });
  setConfig('empresa', empresa.trim());
  res.json({ ok: true });
});

module.exports = router;
