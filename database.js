require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS districts (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS teams (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    district_id  INTEGER NOT NULL REFERENCES districts(id),
    team_number  INTEGER NOT NULL DEFAULT 1,
    instructor   TEXT,
    specialty    TEXT,
    location     TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS employees (
    id        SERIAL PRIMARY KEY,
    matricula TEXT,
    name      TEXT NOT NULL,
    function  TEXT,
    company   TEXT DEFAULT 'ENGECOM',
    team_id   INTEGER REFERENCES teams(id),
    active    INTEGER DEFAULT 1
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    week        TEXT,
    month_year  TEXT,
    date        TEXT,
    time_start  TEXT DEFAULT '07:00',
    time_end    TEXT DEFAULT '07:30',
    description TEXT,
    workload    TEXT DEFAULT '00h 30m',
    obra_vale   TEXT DEFAULT '11 5900130281',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS assignments (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    team_id         INTEGER NOT NULL REFERENCES teams(id),
    instructor_name TEXT,
    status          TEXT DEFAULT 'pending',
    pdf_path        TEXT,
    submitted_at    TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS submissions (
    id            SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    file_path     TEXT NOT NULL,
    original_name TEXT,
    uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS specialty TEXT").catch(() => {});
  await pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS location  TEXT").catch(() => {});

  // Seed: só roda se o banco estiver vazio
  const { rows: [{ c }] } = await pool.query('SELECT COUNT(*)::int AS c FROM districts');
  if (c > 0) return;

  const ins = async (text, values) =>
    (await pool.query(text + ' RETURNING id', values)).rows[0].id;

  const pdId = await ins('INSERT INTO districts (name, city) VALUES ($1, $2)', ['Parauapebas', 'PARAUAPEBAS - PA']);
  const cdId = await ins('INSERT INTO districts (name, city) VALUES ($1, $2)', ['Canaã dos Carajás', 'CANAÃ DOS CARAJÁS - PA']);
  const mdId = await ins('INSERT INTO districts (name, city) VALUES ($1, $2)', ['Marabá', 'MARABÁ - PA']);

  const team = (n, d, num, inst) =>
    ins('INSERT INTO teams (name, district_id, team_number, instructor) VALUES ($1,$2,$3,$4)', [n, d, num, inst || null]);

  const pT1 = await team('Terraplanagem', pdId, 1, 'RILDO MONTEIRO DA SILVA');
  const pT2 = await team('Prevenção',     pdId, 2, 'RAIANE PEREIRA DA SILVA');
  await       team('Corretiva',     pdId, 3, null);
  const cT1 = await team('Terraplanagem', cdId, 1, 'PATRICK DE MENDONÇA GONÇALVES');
  const cT2 = await team('Corretiva',     cdId, 2, 'DANIEL PEREIRA CAMPELO DA SILVA');
  const cT3 = await team('Prevenção',     cdId, 3, 'MICHELY VIEIRA PEREIRA');
  await       team('Terraplanagem', mdId, 1, null);
  await       team('Corretiva',     mdId, 2, null);
  const mT3 = await team('Prevenção',     mdId, 3, 'DANIELA FERREIRA MORAES MATOS');

  const emp = async (list, teamId) => {
    for (const [m, n, f] of list)
      await pool.query(
        'INSERT INTO employees (matricula, name, function, company, team_id) VALUES ($1,$2,$3,$4,$5)',
        [m, n, f, 'ENGECOM', teamId]
      );
  };

  await emp([
    ['19442','DIONIS LIMA DOS SANTOS','MOTORISTA OPERADOR'],
    ['19486','DOMINGOS DA SILVA','MOTORISTA OPERADOR'],
    ['19443','EDGALBES DA SILVA FERREIRA','SINALEIRO (A)'],
    ['19444','ELENILSON DOS SANTOS SILVA DE SOUSA','MOTORISTA OPERADOR'],
    ['19445','ELIS DOS SANTOS BEZERRA','OPERADOR DE MÁQUINAS PESADAS'],
    ['19448','GILSON RAMOS DA COSTA','OPERADOR DE MÁQUINAS PESADAS'],
    ['19449','GILVAN LIMA BRAGA','MOTORISTA OPERADOR'],
    ['19450','JACKSON FRANCISCO DOS SANTOS','ENCARREGADO II'],
    ['19458','JEFERSON MAGNO SILVA COSTA','OPERADOR DE MÁQUINAS PESADAS'],
    ['19451','JOAO VITOR SANTOS DOS SANTOS','SINALEIRO (A)'],
    ['19430','JOSE RIBAMAR PEREIRA DOS SANTOS','OPERADOR DE MÁQUINAS PESADAS'],
    ['19418','RAIMUNDO NONATO DE CARVALHO LEITE FILHO','MOTORISTA OPERADOR'],
    ['19423','SALATIEL LUZ LEITE','OPERADOR DE MÁQUINAS PESADAS'],
  ], pT1);

  await emp([
    ['19424','ANTONIO AROLDO DA SILVA','PEDREIRO'],
    ['19425','ANTONIO DE JESUS SOUSA','OPERADOR DE MAQUINA LEVE'],
    ['19362','DANIEL SOUSA SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19427','DENILSON BISPO DE ALMEIDA','PEDREIRO'],
    ['19428','DOMINGOS DA SILVA LOPO','OPERADOR DE MAQUINA LEVE'],
    ['19429','ERISON DEGLAN RODRIGUES DE OLIVEIRA','OPERADOR DE MAQUINA LEVE'],
    ['19456','FERNANDO DA SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19431','FRANCISCO JOSE DO NASCIMENTO BRIGIDO','OPERADOR DE MAQUINA LEVE'],
    ['19433','JOSIAS PESSOA CABRAL','OPERADOR DE MAQUINA LEVE'],
    ['19438','LEANDRO SOARES DIAS','ENCARREGADO II'],
    ['19461','MAURICIO SILVA LOPES','OPERADOR DE MAQUINA LEVE'],
    ['19437','ODAIR JOSE CAETANO MENDES','OPERADOR DE MAQUINA LEVE'],
    ['19439','RAIMUNDO JOSE MIRANDA DOS SANTOS','OPERADOR DE MAQUINA LEVE'],
  ], pT2);

  await emp([
    ['19363','ALEXSANDRO BARBOSA LEAL','OPERADOR DE MÁQUINAS PESADAS'],
    ['19350','ANTONIO REGINALDO DA SILVA PEREIRA','SINALEIRO (A)'],
    ['19454','DAVIDSON NASCIMENTO DE SOUZA','MOTORISTA OPERADOR'],
    ['19323','EVALDO LIMA PAIVA','OPERADOR DE MÁQUINAS PESADAS'],
    ['19325','FRANCISCO FERREIRA DA SILVA','ENCARREGADO II'],
    ['19465','GUSTAVO DE OLIVEIRA ABREU','OPERADOR DE MÁQUINAS PESADAS'],
    ['19457','JANSEN AQUINO DE SOUSA','MOTORISTA OPERADOR'],
    ['19361','JAQUELINE PEREIRA DOS SANTOS','SINALEIRO (A)'],
    ['19327','JOSE ALANO BATISTA SILVA','OPERADOR DE MÁQUINAS PESADAS'],
    ['19349','MARCELO MOREIRA DOS SANTOS','OPERADOR DE MÁQUINAS PESADAS'],
    ['19461','MAURICIO DOS REIS DE OLIVEIRA','OPERADOR DE MÁQUINAS PESADAS'],
    ['19346','NILTON SANTANA DE MELO','MOTORISTA OPERADOR'],
    ['19347','WEVERTON NEYRON RIBEIRO','MOTORISTA OPERADOR'],
  ], cT1);

  await emp([
    ['19326','ALTEREDO SOUSA DA CRUZ','PEDREIRO'],
    ['19329','ARIEL MARTINS DA CRUZ','OPERADOR DE MAQUINA LEVE'],
    ['19330','DIONISIO DIAS PEREIRA FILHO','ENCARREGADO II'],
    ['19354','JOSE ANTONIO CARDOSO NASCIMENTO','PEDREIRO'],
    ['19331','JOSE MARCELO AQUINO PEREIRA','OPERADOR DE MAQUINA LEVE'],
    ['19348','JOSIMAR BATISTA DA SILVA','MOTORISTA OPERADOR'],
    ['19332','KAWAN KEVIS DA COSTA DOS SANTOS','OPERADOR DE MAQUINA LEVE'],
    ['19333','SALIN JOSE PEREIRA DE SOUZA JUNIOR','OPERADOR DE MAQUINA LEVE'],
    ['19463','SAMUEL DOS SANTOS SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19334','VANDERLEI AGUIAR GOES','OPERADOR DE MAQUINA LEVE'],
  ], cT2);

  await emp([
    ['19335','ANTONIO SOUSA DA SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19336','DARLYSON SOUSA DA CONCEIÇÃO','OPERADOR DE MAQUINA LEVE'],
    ['19355','GEOVANE TORRES PEREIRA','OPERADOR DE MAQUINA LEVE'],
    ['019364','JAMES SILVA SOUZA','OPERADOR DE MAQUINA LEVE'],
    ['19337','JERBISSON SOARES DURAS','OPERADOR DE MAQUINA LEVE'],
    ['19338','JOSIAS CAMARA E CAMARA','OPERADOR DE MAQUINA LEVE'],
    ['19339','KAICK BARBOSA DE JESUS','OPERADOR DE MAQUINA LEVE'],
    ['19340','RONEILLSON DE JESUS SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19341','SAMUEL DOS REIS SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19342','THIAGO RODRIGUES DE MAGALHAES CORDEIRO','ENCARREGADO II'],
    ['19351','TONIELLY BARROSO RAMOS','MOTORISTA OPERADOR'],
    ['19343','WARLACE SANTOS DA SILVA','PEDREIRO'],
  ], cT3);

  await emp([
    ['19368','ANTONIO CARLOS DOS SANTOS','OPERADOR DE MAQUINA LEVE'],
    ['19414','CARLOS ALBERTO SANTOS COSTA','MOTORISTA OPERADOR'],
    ['19372','CLEYDONIR RODRIGUES OLIVEIRA','PEDREIRO'],
    ['19375','DAVI ALVES SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19412','FELIPE GABRIEL MELO DOS SANTOS','OPERADOR DE MAQUINA LEVE'],
    ['19387','JANIO SOUSA E SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19388','JOÃO FERREIRA DA SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19393','JOSE DOMINGOS LOPES','ENCARREGADO II'],
    ['19396','MARCIO GLEI LIMA VIEIRA','OPERADOR DE MAQUINA LEVE'],
    ['19397','MARCOS DA SILVA SENA','OPERADOR DE MAQUINA LEVE'],
    ['19403','SAMUEL ARAUJO DA SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19404','TARCIZO SILVA SOUZA','OPERADOR DE MAQUINA LEVE'],
    ['19392','BONI DO CERTO','PEDREIRO'],
  ], mT3);
}

module.exports = { pool, initDB };
