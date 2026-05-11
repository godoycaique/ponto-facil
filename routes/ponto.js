const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');

const ORDEM = ['entrada', 'intervalo', 'retorno', 'saida'];

// Returns today's records for a given employee and what action is allowed next
router.get('/status/:funcionario_id', (req, res) => {
  const db = getDb();
  const today = todayStr();
  const registros = db.prepare(
    'SELECT * FROM registros WHERE funcionario_id = ? AND data = ? ORDER BY criado_em ASC'
  ).all(req.params.funcionario_id, today);

  const ultimo = registros.length ? registros[registros.length - 1].tipo : null;
  const { permitidos, cooldown_seg } = acoesPossiveis(ultimo, registros);

  res.json({ registros, ultimo, permitidos, cooldown_seg });
});

// Register a punch (without photo)
router.post('/', (req, res) => {
  const { funcionario_id, tipo } = req.body;
  if (!funcionario_id || !tipo) return res.status(400).json({ error: 'Dados inválidos.' });

  const db = getDb();
  const today = todayStr();
  const registros = db.prepare(
    'SELECT tipo, hora FROM registros WHERE funcionario_id = ? AND data = ? ORDER BY criado_em ASC'
  ).all(funcionario_id, today);

  const ultimo = registros.length ? registros[registros.length - 1].tipo : null;
  const { permitidos } = acoesPossiveis(ultimo, registros);

  if (!permitidos.includes(tipo)) {
    return res.status(422).json({ error: `Ação inválida. Permitido: ${permitidos.join(', ') || 'nenhum'}.` });
  }

  const hora = horaStr();
  const result = db.prepare(
    'INSERT INTO registros (funcionario_id, tipo, data, hora) VALUES (?, ?, ?, ?)'
  ).run(funcionario_id, tipo, today, hora);

  res.json({ id: result.lastInsertRowid, tipo, data: today, hora });
});

// Register SAIDA with photo
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const db = getDb();
    const func = db.prepare('SELECT codigo FROM funcionarios WHERE id = ?').get(req.body.funcionario_id);
    const today = todayStr();
    const dir = path.join(__dirname, '..', 'fotos', func ? func.codigo : 'desconhecido', today);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `saida_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

router.post('/saida', upload.single('foto'), (req, res) => {
  const { funcionario_id, observacao } = req.body;
  if (!funcionario_id) return res.status(400).json({ error: 'Dados inválidos.' });

  const db = getDb();
  const today = todayStr();
  const registros = db.prepare(
    'SELECT tipo, hora FROM registros WHERE funcionario_id = ? AND data = ? ORDER BY criado_em ASC'
  ).all(funcionario_id, today);

  const ultimo = registros.length ? registros[registros.length - 1].tipo : null;
  const { permitidos } = acoesPossiveis(ultimo, registros);

  if (!permitidos.includes('saida')) {
    return res.status(422).json({ error: `Ação inválida. Permitido: ${permitidos.join(', ') || 'nenhum'}.` });
  }

  const fotoRelativa = req.file
    ? path.relative(path.join(__dirname, '..'), req.file.path).replace(/\\/g, '/')
    : null;

  const hora = horaStr();
  const result = db.prepare(
    'INSERT INTO registros (funcionario_id, tipo, data, hora, observacao, foto_path) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(funcionario_id, 'saida', today, hora, observacao || null, fotoRelativa);

  res.json({ id: result.lastInsertRowid, tipo: 'saida', data: today, hora, foto_path: fotoRelativa });
});

// Helpers
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function horaStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

const COOLDOWN_SAIDA_SEG = 60 * 60; // 1 hora

function acoesPossiveis(ultimo, registros) {
  switch (ultimo) {
    case null:         return { permitidos: ['entrada'],            cooldown_seg: 0 };
    case 'entrada':    return { permitidos: ['intervalo', 'saida'], cooldown_seg: 0 };
    case 'intervalo':  return { permitidos: ['retorno'],            cooldown_seg: 0 };
    case 'retorno':    return { permitidos: ['saida'],              cooldown_seg: 0 };
    case 'saida': {
      const ultimaSaida = [...registros].reverse().find(r => r.tipo === 'saida');
      if (!ultimaSaida) return { permitidos: [], cooldown_seg: 0 };

      const [sh, sm, ss] = ultimaSaida.hora.split(':').map(Number);
      const now = new Date();
      const saidaMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm, ss).getTime();
      const decorrido = Math.floor((Date.now() - saidaMs) / 1000);
      const restante  = COOLDOWN_SAIDA_SEG - decorrido;

      if (restante <= 0) return { permitidos: ['entrada'], cooldown_seg: 0 };
      return { permitidos: [], cooldown_seg: restante };
    }
    default: return { permitidos: [], cooldown_seg: 0 };
  }
}

module.exports = router;
