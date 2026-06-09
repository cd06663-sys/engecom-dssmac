require('dotenv').config();
const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const multer   = require('multer');
const cors     = require('cors');
let archiver;
try { archiver = require('archiver'); } catch (e) { console.warn('archiver indisponível:', e.message); }
const { createClient } = require('@supabase/supabase-js');

const { pool, initDB, migrateDB } = require('./database');
const { generatePDF }  = require('./pdf-generator');

const app  = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL     || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Query helpers
const sql  = (text, values = []) => pool.query(text, values).then(r => r.rows);
const sql1 = (text, values = []) => pool.query(text, values).then(r => r.rows[0] || null);

// ── MULTER (memória → Supabase Storage) ──────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = ['.jpg','.jpeg','.png','.pdf','.heic','.heif','.webp'];
    cb(null, ok.includes(path.extname(file.originalname).toLowerCase()));
  },
});

// ── MIDDLEWARE ────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── HEALTH ────────────────────────────────────────────────────────
app.get('/health', async (_, res) => {
  try {
    const r = await pool.query('SELECT COUNT(*)::int AS teams FROM teams');
    res.json({ ok: true, teams: r.rows[0].teams });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DISTRICTS ─────────────────────────────────────────────────────
app.get('/api/districts', async (_, res) => {
  res.json(await sql('SELECT * FROM districts ORDER BY name'));
});

// ── TEAMS ─────────────────────────────────────────────────────────
app.get('/api/teams', async (_, res) => {
  res.json(await sql(`
    SELECT t.*, d.name AS district_name, d.city AS district_city
    FROM teams t JOIN districts d ON t.district_id = d.id
    ORDER BY d.name, t.team_number
  `));
});

app.get('/api/teams/:id', async (req, res) => {
  const row = await sql1(`
    SELECT t.*, d.name AS district_name, d.city AS district_city
    FROM teams t JOIN districts d ON t.district_id = d.id
    WHERE t.id = $1
  `, [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Equipe não encontrada' });
  res.json(row);
});

app.post('/api/teams', async (req, res) => {
  const { name, district_id, team_number, instructor, specialty, location } = req.body;
  try {
    const row = await sql1(
      'INSERT INTO teams (name, district_id, team_number, instructor, specialty, location) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [name, district_id, team_number, instructor || null, specialty || null, location || null]
    );
    res.json({ id: row.id });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/teams/:id', async (req, res) => {
  const { name, district_id, team_number, instructor, specialty, location } = req.body;
  try {
    await pool.query(
      'UPDATE teams SET name=$1, district_id=$2, team_number=$3, instructor=$4, specialty=$5, location=$6 WHERE id=$7',
      [name, district_id, team_number, instructor || null, specialty || null, location || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/teams/:id', async (req, res) => {
  await pool.query('DELETE FROM teams WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ── EMPLOYEES ─────────────────────────────────────────────────────
app.get('/api/employees', async (req, res) => {
  const { team_id } = req.query;
  const base = `
    SELECT e.*, t.name AS team_name, d.name AS district_name
    FROM employees e
    LEFT JOIN teams t     ON e.team_id = t.id
    LEFT JOIN districts d ON t.district_id = d.id
    WHERE e.active = 1
  `;
  const rows = team_id
    ? await sql(base + ' AND e.team_id = $1 ORDER BY e.name', [team_id])
    : await sql(base + ' ORDER BY d.name, t.name, e.name');
  res.json(rows);
});

app.post('/api/employees', async (req, res) => {
  const { matricula, name, function: fn, company, team_id } = req.body;
  try {
    const row = await sql1(
      'INSERT INTO employees (matricula, name, function, company, team_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [matricula, name, fn, company || 'ENGECOM', team_id || null]
    );
    res.json({ id: row.id });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/employees/:id', async (req, res) => {
  const { matricula, name, function: fn, company, team_id } = req.body;
  try {
    await pool.query(
      'UPDATE employees SET matricula=$1, name=$2, function=$3, company=$4, team_id=$5 WHERE id=$6',
      [matricula, name, fn, company || 'ENGECOM', team_id || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/employees/:id', async (req, res) => {
  await pool.query('UPDATE employees SET active=0 WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ── SESSIONS ──────────────────────────────────────────────────────
app.get('/api/sessions', async (_, res) => {
  const sessions = await sql('SELECT * FROM sessions ORDER BY date DESC, created_at DESC');
  for (const s of sessions) {
    s.assignments = await sql(`
      SELECT a.*, t.name AS team_name, d.name AS district_name,
             (SELECT COUNT(*)::int FROM submissions WHERE assignment_id=a.id) AS sub_count
      FROM assignments a
      JOIN teams     t ON a.team_id     = t.id
      JOIN districts d ON t.district_id = d.id
      WHERE a.session_id = $1
      ORDER BY d.name, t.team_number
    `, [s.id]);
  }
  res.json(sessions);
});

app.get('/api/sessions/:id', async (req, res) => {
  const s = await sql1('SELECT * FROM sessions WHERE id=$1', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Sessão não encontrada' });
  s.assignments = await sql(`
    SELECT a.*, t.name AS team_name, d.name AS district_name,
           (SELECT COUNT(*)::int FROM submissions WHERE assignment_id=a.id) AS sub_count
    FROM assignments a
    JOIN teams     t ON a.team_id     = t.id
    JOIN districts d ON t.district_id = d.id
    WHERE a.session_id = $1
    ORDER BY d.name, t.team_number
  `, [s.id]);
  res.json(s);
});

app.post('/api/sessions', async (req, res) => {
  const { title, week, month_year, date, time_start, time_end, description, workload, obra_vale } = req.body;
  try {
    const row = await sql1(`
      INSERT INTO sessions (title, week, month_year, date, time_start, time_end, description, workload, obra_vale)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
    `, [title, week, month_year, date,
        time_start || '07:00', time_end || '07:30',
        description, workload || '00h 30m', obra_vale || '11 5900130281']);
    res.json({ id: row.id });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/sessions/:id', async (req, res) => {
  const { title, week, month_year, date, time_start, time_end, description, workload, obra_vale } = req.body;
  try {
    await pool.query(`
      UPDATE sessions
      SET title=$1, week=$2, month_year=$3, date=$4, time_start=$5,
          time_end=$6, description=$7, workload=$8, obra_vale=$9
      WHERE id=$10
    `, [title, week, month_year, date, time_start, time_end, description, workload, obra_vale, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/sessions/:id', async (req, res) => {
  await pool.query('DELETE FROM sessions WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/sessions/:id/assign', async (req, res) => {
  const { assignments: list } = req.body;
  try {
    const newIds = list.map(a => Number(a.team_id));
    const existing = await sql('SELECT id, team_id FROM assignments WHERE session_id=$1', [req.params.id]);
    for (const ex of existing) {
      if (!newIds.includes(ex.team_id)) {
        await pool.query('DELETE FROM assignments WHERE id=$1', [ex.id]);
      }
    }
    const existingTeamIds = existing.map(e => e.team_id);
    for (const a of list) {
      if (existingTeamIds.includes(Number(a.team_id))) {
        await pool.query(
          'UPDATE assignments SET instructor_name=$1 WHERE session_id=$2 AND team_id=$3',
          [a.instructor_name || null, req.params.id, a.team_id]
        );
      } else {
        await pool.query(
          'INSERT INTO assignments (session_id, team_id, instructor_name) VALUES ($1, $2, $3)',
          [req.params.id, a.team_id, a.instructor_name || null]
        );
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── PDF ────────────────────────────────────────────────────────────
app.get('/api/pdf/:sessionId/:teamId', async (req, res) => {
  const { sessionId, teamId } = req.params;

  const session = await sql1('SELECT * FROM sessions WHERE id=$1', [sessionId]);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  const team = await sql1(`
    SELECT t.*, d.name AS district_name, d.city AS district_city
    FROM teams t JOIN districts d ON t.district_id = d.id WHERE t.id = $1
  `, [teamId]);
  if (!team) return res.status(404).json({ error: 'Equipe não encontrada' });

  const assignment = await sql1(
    'SELECT * FROM assignments WHERE session_id=$1 AND team_id=$2',
    [sessionId, teamId]
  );
  const employees = await sql(
    'SELECT * FROM employees WHERE team_id=$1 AND active=1 ORDER BY name',
    [teamId]
  );
  const instructor = assignment ? (assignment.instructor_name || '') : '';

  try {
    const filePath = path.join(os.tmpdir(), `lista_${sessionId}_${teamId}_${Date.now()}.pdf`);
    await generatePDF({ session, team, employees, instructor }, filePath);
    res.download(filePath, `Lista_DSSMAC_${team.name.replace(/\s+/g, '_')}.pdf`, () => {
      try { fs.unlinkSync(filePath); } catch (_) {}
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PDF ZIP (todas as listas de um treinamento) ───────────────────
app.get('/api/pdf/:sessionId/zip', async (req, res) => {
  if (!archiver) return res.status(503).json({ error: 'ZIP indisponível neste servidor' });
  const { sessionId } = req.params;

  const session = await sql1('SELECT * FROM sessions WHERE id=$1', [sessionId]);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  const assignments = await sql(`
    SELECT a.*, t.id AS tid, t.name AS team_name, t.instructor,
           t.specialty, t.location,
           d.name AS district_name, d.city AS district_city
    FROM assignments a
    JOIN teams     t ON a.team_id     = t.id
    JOIN districts d ON t.district_id = d.id
    WHERE a.session_id = $1
    ORDER BY d.name, t.team_number
  `, [sessionId]);

  if (!assignments.length) return res.status(404).json({ error: 'Nenhuma equipe atribuída' });

  const zipName = `Listas_DSSMAC_Semana${session.week || ''}_${(session.month_year || '').replace(/\s+/g,'')}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', err => { console.error('ZIP error:', err); });
  archive.pipe(res);

  for (const a of assignments) {
    const employees = await sql(
      'SELECT * FROM employees WHERE team_id=$1 AND active=1 ORDER BY name',
      [a.tid]
    );
    const team = {
      id: a.tid, name: a.team_name, district_name: a.district_name,
      district_city: a.district_city, specialty: a.specialty, location: a.location,
    };
    const instructor = a.instructor_name || a.instructor || '';
    const tmpFile = path.join(os.tmpdir(), `pdf_${sessionId}_${a.tid}_${Date.now()}.pdf`);
    try {
      await generatePDF({ session, team, employees, instructor }, tmpFile);
      const safeName = `${a.district_name}_${a.team_name}`.replace(/[^a-zA-Z0-9_À-ÿ]/g, '_');
      archive.file(tmpFile, { name: `${safeName}.pdf` });
    } catch (err) { console.error('PDF gen error:', err); }
  }

  await archive.finalize();

  // cleanup temp files after stream ends
  archive.on('finish', () => {
    assignments.forEach(a => {
      const tmp = path.join(os.tmpdir(), `pdf_${sessionId}_${a.tid}_*.pdf`);
      try { fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`pdf_${sessionId}_${a.tid}_`))
               .forEach(f => fs.unlinkSync(path.join(os.tmpdir(), f))); } catch (_) {}
    });
  });
});

// ── SUBMISSIONS ───────────────────────────────────────────────────
app.post('/api/submissions', upload.array('files', 20), async (req, res) => {
  const { assignment_id } = req.body;
  if (!req.files || req.files.length === 0)
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  try {
    for (const f of req.files) {
      const ext      = path.extname(f.originalname).toLowerCase();
      const fileName = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('uploads')
        .upload(fileName, f.buffer, { contentType: f.mimetype });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(fileName);

      await pool.query(
        'INSERT INTO submissions (assignment_id, file_path, original_name) VALUES ($1, $2, $3)',
        [assignment_id, publicUrl, f.originalname]
      );
    }
    await pool.query(
      "UPDATE assignments SET status='submitted', submitted_at=CURRENT_TIMESTAMP WHERE id=$1",
      [assignment_id]
    );
    res.json({ success: true, count: req.files.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/submissions/:assignmentId', async (req, res) => {
  res.json(await sql(
    'SELECT * FROM submissions WHERE assignment_id=$1 ORDER BY uploaded_at DESC',
    [req.params.assignmentId]
  ));
});

app.delete('/api/submissions/:id', async (req, res) => {
  const row = await sql1('SELECT * FROM submissions WHERE id=$1', [req.params.id]);
  if (row) {
    const fileName = decodeURIComponent(row.file_path.split('/').pop());
    await supabase.storage.from('uploads').remove([fileName]);
    await pool.query('DELETE FROM submissions WHERE id=$1', [req.params.id]);
    const cnt = await sql1(
      'SELECT COUNT(*)::int AS c FROM submissions WHERE assignment_id=$1',
      [row.assignment_id]
    );
    if (cnt.c === 0) {
      await pool.query(
        "UPDATE assignments SET status='pending', submitted_at=NULL WHERE id=$1",
        [row.assignment_id]
      );
    }
  }
  res.json({ success: true });
});

app.post('/api/assignments/:id/reset', async (req, res) => {
  await pool.query(
    "UPDATE assignments SET status='pending', submitted_at=NULL WHERE id=$1",
    [req.params.id]
  );
  res.json({ success: true });
});

// ── DASHBOARD ─────────────────────────────────────────────────────
app.get('/api/dashboard', async (_, res) => {
  try {
    const districts = await sql('SELECT * FROM districts ORDER BY name');
    const result = await Promise.all(districts.map(async d => {
      const teams = await sql('SELECT * FROM teams WHERE district_id=$1 ORDER BY team_number', [d.id]);
      const teamsData = await Promise.all(teams.map(async t => {
        const p = await sql1("SELECT COUNT(*)::int AS c FROM assignments WHERE team_id=$1 AND status='pending'",   [t.id]);
        const s = await sql1("SELECT COUNT(*)::int AS c FROM assignments WHERE team_id=$1 AND status='submitted'", [t.id]);
        const e = await sql1('SELECT COUNT(*)::int AS c FROM employees WHERE team_id=$1 AND active=1',             [t.id]);
        return { ...t, pending: p.c, submitted: s.c, employees: e.c };
      }));
      return { ...d, teams: teamsData };
    }));
    res.json(result);
  } catch (err) {
    console.error('dashboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── TEAM PORTAL ───────────────────────────────────────────────────
app.get('/api/portal/:teamId', async (req, res) => {
  try {
    const team = await sql1(`
      SELECT t.*, d.name AS district_name, d.city AS district_city
      FROM teams t JOIN districts d ON t.district_id = d.id WHERE t.id = $1
    `, [req.params.teamId]);
    if (!team) return res.status(404).json({ error: 'Equipe não encontrada' });

    const assignments = await sql(`
      SELECT a.*, s.title, s.date, s.week, s.month_year, s.time_start, s.time_end, s.description,
             (SELECT COUNT(*)::int FROM submissions WHERE assignment_id=a.id) AS sub_count
      FROM assignments a
      JOIN sessions s ON a.session_id = s.id
      WHERE a.team_id = $1
      ORDER BY s.date DESC
    `, [req.params.teamId]);

    res.json({ team, assignments });
  } catch (err) {
    console.error('portal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/equipe/:teamId', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'equipe.html'));
});

// ── START ─────────────────────────────────────────────────────────
async function start() {
  // 1. Banco primeiro (Railway aguarda até 100s para o app ouvir a porta)
  try {
    await initDB();
    console.log('  Banco OK');
  } catch (err) {
    console.error('  initDB erro:', err.message);
  }

  // 2. Sobe o servidor
  app.listen(PORT, () => {
    console.log('\n======================================');
    console.log('  ENGECOM DSSMAC - Sistema de Gestao');
    console.log('======================================');
    console.log(`  Porta: ${PORT}\n`);

    // 3. Migração das colunas novas roda 3s depois — sem bloquear nada
    setTimeout(() => migrateDB().catch(console.error), 3000);
  });
}

start().catch(console.error);
