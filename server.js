const express = require('express');
const path = require('path');
const fs = require('fs');

const { initDb } = require('./db/database');
const pontoRoutes       = require('./routes/ponto');
const funcionariosRoutes = require('./routes/funcionarios');
const adminRoutes        = require('./routes/admin');
const financeiroRoutes   = require('./routes/financeiro');
const configRoutes       = require('./routes/config');

const app = express();
const PORT = 3000;

// Restrict to local network only
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || '';
  const clean = ip.replace('::ffff:', '');

  const isLocal =
    clean === '127.0.0.1' ||
    clean === '::1' ||
    /^192\.168\./.test(clean) ||
    /^10\./.test(clean) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(clean);

  if (!isLocal) {
    return res.status(403).json({ error: 'Acesso permitido apenas na rede local.' });
  }
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded photos
app.use('/fotos', express.static(path.join(__dirname, 'fotos')));

app.use('/api/ponto', pontoRoutes);
app.use('/api/funcionarios', funcionariosRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/config', configRoutes);

// Ensure fotos directory exists
fs.mkdirSync(path.join(__dirname, 'fotos'), { recursive: true });

initDb();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`PontoSimples rodando em http://localhost:${PORT}`);
  console.log('Acesso restrito à rede local.');
});
