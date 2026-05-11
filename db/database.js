const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'ponto.db');

let db;

function getDb() {
  if (!db) db = new DatabaseSync(DB_PATH);
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS funcionarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS registros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('entrada','intervalo','retorno','saida')),
      data TEXT NOT NULL,
      hora TEXT NOT NULL,
      observacao TEXT,
      foto_path TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
    );

    CREATE TABLE IF NOT EXISTS fechamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT,
      data_pagamento TEXT,
      status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','pago')),
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS fechamento_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fechamento_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      total_minutos INTEGER NOT NULL DEFAULT 0,
      valor_hora REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(fechamento_id) REFERENCES fechamentos(id),
      FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id),
      UNIQUE(funcionario_id, data)
    );
  `);

  // Migration: add valor_hora to funcionarios if not present (DB may already exist)
  try {
    db.exec('ALTER TABLE funcionarios ADD COLUMN valor_hora REAL NOT NULL DEFAULT 0');
  } catch (e) {
    if (!e.message.includes('duplicate column name')) throw e;
  }

  console.log('Banco de dados inicializado.');
}

module.exports = { getDb, initDb };
