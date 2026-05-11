# PontoSimples

Sistema local de controle de jornada de trabalho. Roda em uma máquina da rede e é acessado por qualquer dispositivo (celular, tablet, PC) via navegador — sem app, sem instalação nos clientes.

---

## Como funciona

```
[ Máquina servidora com Node.js ]
        |
        |  rede Wi-Fi local
        |
 ┌──────┴──────┐
 │             │
Celular      Outro PC
(browser)    (browser)
```

- O **servidor** precisa estar ligado e com o sistema rodando
- Os **clientes** acessam apenas com o browser — nenhuma instalação
- Os dados ficam todos no servidor, em um arquivo SQLite (`db/ponto.db`)
- As fotos ficam na pasta `fotos/` do servidor

---

## Requisitos

- [Node.js](https://nodejs.org) **versão 22 ou superior** (o sistema usa o módulo `node:sqlite` nativo)
- Windows, Linux ou macOS

Para verificar a versão instalada:
```
node --version
```

> **Nota:** Este projeto é 100% Node.js. Não é necessário Python, venv ou qualquer outra linguagem.
> As dependências são gerenciadas pelo `npm` e ficam na pasta `node_modules/` (criada automaticamente com `npm install`).

---

## Instalação

### Opção A — Clonar do GitHub (recomendado)

```bash
git clone https://github.com/godoycaique/ponto-facil.git
cd ponto-facil
npm install
npm start
```

### Opção B — Copiar a pasta manualmente

Copie a pasta do projeto para a máquina que vai rodar o servidor (pen drive, rede, etc.) e execute:

```bash
npm install
npm start
```

---

## Primeiro acesso

Ao abrir `http://localhost:3000` pela primeira vez, o sistema pedirá o **nome da empresa**. Informe e clique em "Começar" — essa configuração fica salva no banco de dados.

---

## Acessar o sistema

Após `npm start` você verá:
```
PontoSimples rodando em http://localhost:3000
Acesso restrito à rede local.
```

- **Na própria máquina:** `http://localhost:3000`
- **Painel admin:** `http://localhost:3000/admin.html`
- **Em outros dispositivos na mesma rede:** `http://IP-DO-SERVIDOR:3000`

Para descobrir o IP do servidor no Windows:
```
ipconfig
```
Procure por **Endereço IPv4** no adaptador Wi-Fi ou Ethernet. Geralmente é algo como `192.168.0.X`.

---

## Liberar acesso na rede local (Windows)

Por padrão o Windows Firewall pode bloquear a porta 3000 para outros dispositivos. Rode este comando **como Administrador** uma única vez:

```powershell
New-NetFirewallRule -DisplayName "PontoSimples 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any
```

Ou manualmente: **Firewall do Windows → Regras de Entrada → Nova Regra → Porta → TCP → 3000 → Permitir**.

---

## Iniciar automaticamente com o Windows

### Opção A — pm2 (recomendado)

```
npm install -g pm2
pm2 start npm --name "pontosimples" -- start
pm2 save
pm2 startup
```

Execute o comando que o `pm2 startup` mostrar. Depois disso o sistema sobe automaticamente com o Windows.

Comandos úteis do pm2:
```
pm2 status
pm2 logs pontosimples
pm2 restart pontosimples
pm2 stop pontosimples
```

### Opção B — Agendador de Tarefas do Windows

1. Abra o **Agendador de Tarefas**
2. Clique em **Criar Tarefa Básica**
3. Nome: `PontoSimples`
4. Disparador: **Ao iniciar o computador**
5. Ação: **Iniciar um programa**
   - Programa: `node`
   - Argumentos: `--no-warnings server.js`
   - Iniciar em: `C:\caminho\para\ponto-facil`
6. Marque **Executar independentemente do logon do usuário**

---

## Migrar para outra máquina

1. **Parar o servidor** atual
2. **Copiar apenas os dados** para a nova máquina:
   - `db/ponto.db` — banco de dados com todos os registros e funcionários
   - `fotos/` — fotos de saída dos funcionários
3. Na nova máquina, clonar o repositório e instalar:
   ```bash
   git clone https://github.com/godoycaique/ponto-facil.git
   cd ponto-facil
   npm install
   ```
4. Colocar o `ponto.db` e a pasta `fotos/` nos lugares corretos
5. Rodar `npm start`

> Os dados ficam 100% no `db/ponto.db`. Faça backup deste arquivo regularmente.

---

## Backup

Basta copiar dois itens:

| O que | Onde |
|---|---|
| Banco de dados | `db/ponto.db` |
| Fotos de saída | `fotos/` |

Sugestão: agendar uma cópia automática para um HD externo ou nuvem (Google Drive, OneDrive) usando o Agendador de Tarefas do Windows.

---

## Estrutura do projeto

```
ponto-facil/
├── server.js              # Servidor principal (Express)
├── package.json
├── package-lock.json
├── db/
│   ├── database.js        # Schema e inicialização do SQLite
│   └── ponto.db           # Banco de dados (gerado automaticamente, não versionado)
├── routes/
│   ├── ponto.js           # Registro de pontos
│   ├── funcionarios.js    # CRUD de funcionários
│   ├── admin.js           # Relatórios e edição
│   ├── financeiro.js      # Fechamentos e pagamentos
│   └── config.js          # Configuração da empresa
├── public/
│   ├── index.html         # Tela do funcionário (mobile)
│   ├── admin.html         # Painel do gestor
│   ├── css/style.css
│   └── js/
│       ├── app.js         # Lógica da tela do funcionário
│       └── admin.js       # Lógica do painel admin
└── fotos/                 # Fotos de saída (gerado automaticamente, não versionado)
    └── CODIGO/
        └── YYYY-MM-DD/
            └── saida_*.jpg
```

---

## Funcionalidades

### Tela do funcionário (`/`)
- Login por código com nome salvo no dispositivo
- Registro de ponto: Entrada, Intervalo, Retorno, Saída
- Regras automáticas: não permite saída sem entrada, retorno sem intervalo, etc.
- Cooldown de 1 hora após saída para nova entrada (hora extra)
- Saída exige foto da produção (câmera direta, sem galeria) e observação
- Timer ao vivo mostrando tempo trabalhado

### Painel do gestor (`/admin.html`)
- **Resumo do dia** — cards com horários de cada funcionário
- **Todos os registros** — tabela filtrável com edição de hora e observação
- **Funcionários** — cadastro com código incremental (prefixo configurável) e valor/hora
- **Financeiro** — dias em aberto, criação de fechamentos, histórico, marcar como pago
- **Exportar CSV** — registros por período e funcionário
- **Configurações** — nome da empresa

### Segurança
- Acesso bloqueado fora da rede local (IPs externos recebem erro 403)
- Câmera exclusiva na saída: usa `getUserMedia` em HTTPS/localhost, `capture` nativo em HTTP

---

## Portas e configuração

| Configuração | Valor padrão |
|---|---|
| Porta | `3000` |
| Cooldown após saída | 1 hora |
| Mínimo de horas para financeiro | 30 minutos |

Para mudar a porta, edite `server.js`:
```js
const PORT = 3000; // altere aqui
```
