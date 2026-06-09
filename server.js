require('dotenv').config();
const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const crypto   = require('crypto');
const multer   = require('multer');
const cors     = require('cors');

let archiver;
try { archiver = require('archiver'); } catch (_) {}

const { supabase, sq, initDB } = require('./database');
const { generatePDF }          = require('./pdf-generator');

const app  = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ||
  crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
if (!process.env.ADMIN_PASSWORD) {
  console.warn(`ADMIN_PASSWORD não configurada; senha temporária: ${ADMIN_PASSWORD}`);
}

// ── helpers ──────────────────────────────────────────────────────
const sqAll = (q) => sq(q);
const sqOne = async (q) => { const r = await sq(q.limit(1)); return r?.[0] || null; };

function flatTeam(t) {
  if (!t) return t;
  return {
    ...t,
    district_name: t.districts?.name ?? t.district_name ?? null,
    district_city: t.districts?.city ?? t.district_city ?? null,
    districts: undefined,
  };
}

function flatAssignment(a) {
  if (!a) return a;
  return {
    ...a,
    team_name:     a.teams?.name       ?? a.team_name    ?? null,
    district_name: a.teams?.districts?.name ?? a.district_name ?? null,
    sub_count:     Array.isArray(a.submissions) ? (a.submissions[0]?.count ?? 0) : (a.sub_count ?? 0),
    teams:         undefined,
    submissions:   undefined,
  };
}

function flatEmployee(e) {
  if (!e) return e;
  return {
    ...e,
    team_name:     e.teams?.name ?? e.team_name ?? null,
    district_name: e.teams?.districts?.name ?? e.district_name ?? null,
    teams:         undefined,
  };
}

// ── auth ─────────────────────────────────────────────────────────
function hash(v) { return crypto.createHash('sha256').update(String(v)).digest(); }
function safeEqual(a, b) { return crypto.timingSafeEqual(hash(a), hash(b)); }

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return askAuth(res);
  let decoded = '';
  try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch (_) { return askAuth(res); }
  const sep = decoded.indexOf(':');
  const user = sep >= 0 ? decoded.slice(0, sep) : '';
  const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
  if (safeEqual(user, ADMIN_USER) && safeEqual(pass, ADMIN_PASSWORD)) return next();
  return askAuth(res);
}
function askAuth(res) {
  res.setHeader('WWW-Authenticate', 'Basic realm="ENGECOM DSSMAC"');
  return res.status(401).send('Autenticação requerida');
}

function isPublicApi(req) {
  return (
    (req.method === 'GET'  && /^\/portal\/\d+$/.test(req.path)) ||
    (req.method === 'GET'  && /^\/portal\/\d+\/submissions\/\d+$/.test(req.path)) ||
    (req.method === 'GET'  && /^\/pdf\/\d+\/\d+$/.test(req.path)) ||
    (req.method === 'POST' && req.path === '/submissions')
  );
}

function idParam(value, label = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error(`${label} inválido`);
    err.status = 400;
    throw err;
  }
  return id;
}

function storageNameFromUrl(fileUrl) {
  if (!fileUrl) return null;
  try {
    const url = new URL(fileUrl);
    return decodeURIComponent(url.pathname.split('/').pop() || '');
  } catch (_) {
    return decodeURIComponent(String(fileUrl).split('/').pop() || '');
  }
}

async function removeStorageFile(fileUrl) {
  if (!supabase) return;
  const fileName = storageNameFromUrl(fileUrl);
  if (fileName) await supabase.storage.from('uploads').remove([fileName]);
}

async function cleanupTempFiles(files = []) {
  await Promise.all(files.map(f =>
    fs.promises.unlink(f.path).catch(() => {})
  ));
}

const uploadDir = path.join(os.tmpdir(), 'engecom_uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, f, cb) => {
      const ext = path.extname(f.originalname).toLowerCase();
      cb(null, `upload_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024, files: 20 },
  fileFilter: (_, f, cb) => {
    const ext  = path.extname(f.originalname).toLowerCase();
    const mime = String(f.mimetype || '').toLowerCase();
    const allowed = {
      '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'],
      '.png': ['image/png'],  '.pdf':  ['application/pdf'],
      '.webp':['image/webp'],
      '.heic':['image/heic','image/heif','application/octet-stream'],
      '.heif':['image/heic','image/heif','application/octet-stream'],
    };
    if (!allowed[ext]?.includes(mime))
      return cb(new Error('Tipo de arquivo não permitido. Envie JPG, PNG, PDF, HEIC ou WEBP.'));
    cb(null, true);
  },
});

app.use(cors());
app.use(express.json());
app.get(['/', '/index.html'], requireAdmin, (_, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);
app.get('/equipe/:teamId', (_, res) =>
  res.sendFile(path.join(__dirname, 'public', 'equipe.html'))
);
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/api', (req, res, next) => isPublicApi(req) ? next() : requireAdmin(req, res, next));

// ── HEALTH ───────────────────────────────────────────────────────
app.get('/health', async (_, res) => {
  try {
    const { count, error } = await supabase.from('districts')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    res.json({ ok: true, districts: count, via: 'supabase-sdk' });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || '(sem mensagem)',
      code: err.code,
      supabase_url: process.env.SUPABASE_URL ? 'SET' : 'NOT SET',
    });
  }
});

// ── DISTRICTS ────────────────────────────────────────────────────
app.get('/api/districts', async (_, res) => {
  try {
    res.json(await sqAll(supabase.from('districts').select('*').order('name')));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TEAMS ────────────────────────────────────────────────────────
app.get('/api/teams', async (_, res) => {
  try {
    const rows = await sqAll(
      supabase.from('teams').select('*, districts(name, city)').order('team_number')
    );
    res.json(rows.map(flatTeam).sort((a, b) =>
      (a.district_name || '').localeCompare(b.district_name || '') || a.team_number - b.team_number
    ));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/teams/:id', async (req, res) => {
  try {
    const row = await sqOne(
      supabase.from('teams').select('*, districts(name, city)').eq('id', req.params.id)
    );
    if (!row) return res.status(404).json({ error: 'Equipe não encontrada' });
    res.json(flatTeam(row));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/teams', async (req, res) => {
  const { name, district_id, team_number, instructor, specialty, location } = req.body;
  try {
    const [row] = await sq(
      supabase.from('teams')
        .insert({ name, district_id, team_number, instructor: instructor || null,
                  specialty: specialty || null, location: location || null })
        .select('id')
    );
    res.json({ id: row.id });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/teams/:id', async (req, res) => {
  const { name, district_id, team_number, instructor, specialty, location } = req.body;
  try {
    await sq(supabase.from('teams').update({
      name, district_id, team_number,
      instructor: instructor || null,
      specialty:  specialty  || null,
      location:   location   || null,
    }).eq('id', req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/teams/:id', async (req, res) => {
  try {
    const teamId = idParam(req.params.id, 'equipe');
    const subs = await sqAll(
      supabase.from('submissions').select('file_path, assignments!inner(team_id)')
        .eq('assignments.team_id', teamId)
    );
    await Promise.all(subs.map(s => removeStorageFile(s.file_path).catch(() => {})));
    await sq(supabase.from('employees').update({ team_id: null }).eq('team_id', teamId));
    await sq(supabase.from('assignments').delete().eq('team_id', teamId));
    await sq(supabase.from('teams').delete().eq('id', teamId));
    res.json({ success: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ── EMPLOYEES ────────────────────────────────────────────────────
app.get('/api/employees', async (req, res) => {
  try {
    const { team_id } = req.query;
    let q = supabase.from('employees')
      .select('*, teams(name, districts(name))')
      .eq('active', 1)
      .order('name');
    if (team_id) q = q.eq('team_id', team_id);
    const rows = await sqAll(q);
    res.json(rows.map(flatEmployee).sort((a, b) =>
      team_id ? 0 :
      (a.district_name || '').localeCompare(b.district_name || '') ||
      (a.team_name || '').localeCompare(b.team_name || '') ||
      a.name.localeCompare(b.name)
    ));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employees', async (req, res) => {
  const { matricula, name, function: fn, company, team_id } = req.body;
  try {
    const [row] = await sq(
      supabase.from('employees')
        .insert({ matricula, name, function: fn, company: company || 'ENGECOM', team_id: team_id || null })
        .select('id')
    );
    res.json({ id: row.id });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/employees/:id', async (req, res) => {
  const { matricula, name, function: fn, company, team_id } = req.body;
  try {
    await sq(supabase.from('employees').update({
      matricula, name, function: fn,
      company:  company  || 'ENGECOM',
      team_id:  team_id  || null,
    }).eq('id', req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    await sq(supabase.from('employees').update({ active: 0 }).eq('id', req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SESSIONS ─────────────────────────────────────────────────────
async function loadAssignments(sessionId) {
  const rows = await sqAll(
    supabase.from('assignments')
      .select('*, teams!inner(name, team_number, districts!inner(name)), submissions(count)')
      .eq('session_id', sessionId)
  );
  return rows.map(flatAssignment).sort((a, b) =>
    (a.district_name || '').localeCompare(b.district_name || '') ||
    ((a.team_number || 0) - (b.team_number || 0))
  );
}

app.get('/api/sessions', async (_, res) => {
  try {
    const sessions = await sqAll(
      supabase.from('sessions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false })
    );
    for (const s of sessions) s.assignments = await loadAssignments(s.id);
    res.json(sessions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const s = await sqOne(supabase.from('sessions').select('*').eq('id', req.params.id));
    if (!s) return res.status(404).json({ error: 'Sessão não encontrada' });
    s.assignments = await loadAssignments(s.id);
    res.json(s);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sessions', async (req, res) => {
  const { title, week, month_year, date, time_start, time_end, description, workload, obra_vale, autoAssign } = req.body;
  try {
    const [row] = await sq(
      supabase.from('sessions').insert({
        title, week, month_year, date,
        time_start:  time_start  || '07:00',
        time_end:    time_end    || '07:30',
        description, workload:   workload   || '00h 30m',
        obra_vale:   obra_vale   || '11 5900130281',
      }).select('id')
    );
    if (autoAssign !== false) {
      const teams = await sqAll(supabase.from('teams').select('id, instructor'));
      for (const t of teams) {
        await sq(supabase.from('assignments')
          .insert({ session_id: row.id, team_id: t.id, instructor_name: t.instructor || null })
        ).catch(() => {});
      }
    }
    res.json({ id: row.id });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/sessions/:id', async (req, res) => {
  const { title, week, month_year, date, time_start, time_end, description, workload, obra_vale } = req.body;
  try {
    await sq(supabase.from('sessions').update({
      title, week, month_year, date, time_start, time_end, description, workload, obra_vale,
    }).eq('id', req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const sessionId = idParam(req.params.id, 'treinamento');
    const subs = await sqAll(
      supabase.from('submissions').select('file_path, assignments!inner(session_id)')
        .eq('assignments.session_id', sessionId)
    );
    await Promise.all(subs.map(s => removeStorageFile(s.file_path).catch(() => {})));
    await sq(supabase.from('sessions').delete().eq('id', sessionId));
    res.json({ success: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

app.post('/api/sessions/:id/assign', async (req, res) => {
  const { assignments: list } = req.body;
  if (!Array.isArray(list)) return res.status(400).json({ error: 'Lista de equipes inválida' });
  try {
    const sessionId = idParam(req.params.id, 'treinamento');
    const newIds = [...new Set(list.map(a => idParam(a.team_id, 'equipe')))];
    const existing = await sqAll(
      supabase.from('assignments').select('id, team_id').eq('session_id', sessionId)
    );
    for (const ex of existing)
      if (!newIds.includes(ex.team_id))
        await sq(supabase.from('assignments').delete().eq('id', ex.id));
    const existingTeamIds = existing.map(e => e.team_id);
    for (const a of list) {
      const teamId = idParam(a.team_id, 'equipe');
      if (existingTeamIds.includes(teamId)) {
        await sq(supabase.from('assignments').update({ instructor_name: a.instructor_name || null })
          .eq('session_id', sessionId).eq('team_id', teamId));
      } else {
        await sq(supabase.from('assignments')
          .insert({ session_id: sessionId, team_id: teamId, instructor_name: a.instructor_name || null }));
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── PDF individual ────────────────────────────────────────────────
app.get('/api/pdf/:sessionId/:teamId(\\d+)', async (req, res) => {
  try {
    const sessionId = idParam(req.params.sessionId, 'treinamento');
    const teamId    = idParam(req.params.teamId,    'equipe');
    const session    = await sqOne(supabase.from('sessions').select('*').eq('id', sessionId));
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    const teamRaw    = await sqOne(supabase.from('teams').select('*, districts(name, city)').eq('id', teamId));
    if (!teamRaw) return res.status(404).json({ error: 'Equipe não encontrada' });
    const team       = flatTeam(teamRaw);
    const assignment = await sqOne(
      supabase.from('assignments').select('*').eq('session_id', sessionId).eq('team_id', teamId)
    );
    if (!assignment) return res.status(404).json({ error: 'Equipe não atribuída a este treinamento' });
    const employees  = await sqAll(
      supabase.from('employees').select('*').eq('team_id', teamId).eq('active', 1).order('name')
    );
    const instructor = assignment.instructor_name || team.instructor || '';
    const filePath   = path.join(os.tmpdir(), `lista_${sessionId}_${teamId}_${Date.now()}.pdf`);
    await generatePDF({ session, team, employees, instructor }, filePath);
    res.download(filePath, `Lista_DSSMAC_${team.name.replace(/\s+/g,'_')}.pdf`, () => {
      try { fs.unlinkSync(filePath); } catch (_) {}
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PDF ZIP ───────────────────────────────────────────────────────
app.get('/api/pdf/:sessionId/zip', async (req, res) => {
  if (!archiver) return res.status(503).json({ error: 'ZIP não disponível' });
  try {
    const { sessionId } = req.params;
    const session = await sqOne(supabase.from('sessions').select('*').eq('id', sessionId));
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    const assignsRaw = await sqAll(
      supabase.from('assignments')
        .select('*, teams!inner(id, name, instructor, specialty, location, districts!inner(name, city))')
        .eq('session_id', sessionId)
    );
    const assigns = assignsRaw.map(a => ({
      ...a,
      tid:          a.teams.id,
      team_name:    a.teams.name,
      instructor:   a.teams.instructor,
      specialty:    a.teams.specialty,
      location:     a.teams.location,
      district_name: a.teams.districts.name,
      district_city: a.teams.districts.city,
      teams: undefined,
    })).sort((a, b) =>
      (a.district_name || '').localeCompare(b.district_name || '') || (a.team_number || 0) - (b.team_number || 0)
    );
    if (!assigns.length) return res.status(404).json({ error: 'Nenhuma equipe atribuída' });

    const zipName = `Listas_DSSMAC_S${session.week || ''}_${(session.month_year || '').replace(/\s+/g, '')}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => console.error('ZIP error:', err));
    archive.pipe(res);

    const tmpFiles = [];
    const cleanup = () => tmpFiles.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
    archive.on('finish', cleanup);
    res.on('close', cleanup);

    for (const a of assigns) {
      try {
        const employees = await sqAll(
          supabase.from('employees').select('*').eq('team_id', a.tid).eq('active', 1).order('name')
        );
        const team = {
          id: a.tid, name: a.team_name,
          district_name: a.district_name, district_city: a.district_city,
          specialty: a.specialty, location: a.location,
        };
        const tmpFile = path.join(os.tmpdir(), `zip_${sessionId}_${a.tid}_${Date.now()}.pdf`);
        await generatePDF({ session, team, employees, instructor: a.instructor_name || a.instructor || '' }, tmpFile);
        const safeName = `${a.district_name}_${a.team_name}`.replace(/[^a-zA-Z0-9_À-ÿ]/g, '_');
        archive.file(tmpFile, { name: `${safeName}.pdf` });
        tmpFiles.push(tmpFile);
      } catch (e) { console.error('PDF erro:', e.message); }
    }
    await archive.finalize();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SUBMISSIONS ───────────────────────────────────────────────────
app.post('/api/submissions', upload.array('files', 20), async (req, res) => {
  const { assignment_id, team_id } = req.body;
  if (!req.files?.length) {
    await cleanupTempFiles(req.files);
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }
  try {
    const assignmentId = idParam(assignment_id, 'atribuição');
    const teamId       = idParam(team_id,       'equipe');
    const assignment   = await sqOne(
      supabase.from('assignments').select('*').eq('id', assignmentId).eq('team_id', teamId)
    );
    if (!assignment) return res.status(403).json({ error: 'Atribuição não pertence a esta equipe' });

    const totalSize = req.files.reduce((s, f) => s + f.size, 0);
    if (totalSize > 120 * 1024 * 1024)
      return res.status(413).json({ error: 'Envio muito grande. Envie menos arquivos por vez.' });

    for (const f of req.files) {
      const ext      = path.extname(f.originalname).toLowerCase();
      const fileName = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      const buffer   = await fs.promises.readFile(f.path);
      const { error: upErr } = await supabase.storage
        .from('uploads').upload(fileName, buffer, { contentType: f.mimetype });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(fileName);
      await sq(supabase.from('submissions')
        .insert({ assignment_id: assignmentId, file_path: publicUrl, original_name: f.originalname }));
    }
    await sq(supabase.from('assignments').update({
      status: 'submitted', submitted_at: new Date().toISOString()
    }).eq('id', assignmentId));
    res.json({ success: true, count: req.files.length });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  } finally {
    await cleanupTempFiles(req.files);
  }
});

app.get('/api/submissions/:assignmentId', async (req, res) => {
  try {
    res.json(await sqAll(
      supabase.from('submissions').select('*')
        .eq('assignment_id', req.params.assignmentId)
        .order('uploaded_at', { ascending: false })
    ));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/submissions/:id', async (req, res) => {
  try {
    const row = await sqOne(
      supabase.from('submissions').select('*').eq('id', idParam(req.params.id))
    );
    if (row) {
      await removeStorageFile(row.file_path);
      await sq(supabase.from('submissions').delete().eq('id', req.params.id));
      const { count } = await supabase.from('submissions').select('*', { count: 'exact', head: true })
        .eq('assignment_id', row.assignment_id);
      if (count === 0)
        await sq(supabase.from('assignments').update({ status: 'pending', submitted_at: null })
          .eq('id', row.assignment_id));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/assignments/:id/reset', async (req, res) => {
  try {
    await sq(supabase.from('assignments').update({ status: 'pending', submitted_at: null })
      .eq('id', req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DASHBOARD ────────────────────────────────────────────────────
app.get('/api/dashboard', async (_, res) => {
  try {
    const districts = await sqAll(supabase.from('districts').select('*').order('name'));
    const result = await Promise.all(districts.map(async d => {
      const teams = await sqAll(
        supabase.from('teams').select('*').eq('district_id', d.id).order('team_number')
      );
      const teamsData = await Promise.all(teams.map(async t => {
        const [pending, submitted, employees] = await Promise.all([
          supabase.from('assignments').select('*', { count: 'exact', head: true })
            .eq('team_id', t.id).eq('status', 'pending'),
          supabase.from('assignments').select('*', { count: 'exact', head: true })
            .eq('team_id', t.id).eq('status', 'submitted'),
          supabase.from('employees').select('*', { count: 'exact', head: true })
            .eq('team_id', t.id).eq('active', 1),
        ]);
        return {
          ...t,
          pending:   pending.count   ?? 0,
          submitted: submitted.count ?? 0,
          employees: employees.count ?? 0,
        };
      }));
      return { ...d, teams: teamsData };
    }));
    res.json(result);
  } catch (err) {
    console.error('dashboard:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PORTAL ───────────────────────────────────────────────────────
app.get('/api/portal/:teamId', async (req, res) => {
  try {
    const teamRaw = await sqOne(
      supabase.from('teams').select('*, districts(name, city)').eq('id', req.params.teamId)
    );
    if (!teamRaw) return res.status(404).json({ error: 'Equipe não encontrada' });
    const team = flatTeam(teamRaw);
    const assignsRaw = await sqAll(
      supabase.from('assignments')
        .select('*, sessions!inner(title, date, week, month_year, time_start, time_end, description), submissions(count)')
        .eq('team_id', req.params.teamId)
        .order('date', { foreignTable: 'sessions', ascending: false })
    );
    const assignments = assignsRaw.map(a => ({
      ...a,
      title:       a.sessions?.title,
      date:        a.sessions?.date,
      week:        a.sessions?.week,
      month_year:  a.sessions?.month_year,
      time_start:  a.sessions?.time_start,
      time_end:    a.sessions?.time_end,
      description: a.sessions?.description,
      sub_count:   a.submissions?.[0]?.count ?? 0,
      sessions:    undefined,
      submissions: undefined,
    }));
    res.json({ team, assignments });
  } catch (err) {
    console.error('portal:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/portal/:teamId/submissions/:assignmentId', async (req, res) => {
  try {
    const teamId       = idParam(req.params.teamId,       'equipe');
    const assignmentId = idParam(req.params.assignmentId, 'atribuição');
    const assignment   = await sqOne(
      supabase.from('assignments').select('id').eq('id', assignmentId).eq('team_id', teamId)
    );
    if (!assignment) return res.status(404).json({ error: 'Atribuição não encontrada para esta equipe' });
    res.json(await sqAll(
      supabase.from('submissions').select('*')
        .eq('assignment_id', assignmentId)
        .order('uploaded_at', { ascending: false })
    ));
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

app.use(async (err, req, res, next) => {
  if (!err) return next();
  await cleanupTempFiles(req.files || []);
  const status = err instanceof multer.MulterError ? 400 : (err.status || 500);
  res.status(status).json({ error: err.message || 'Erro inesperado' });
});

// ── START ─────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`ENGECOM DSSMAC na porta ${PORT}`));

(async function connectDB() {
  for (let i = 1; ; i++) {
    try {
      await initDB();
      console.log('Banco OK');
      return;
    } catch (err) {
      console.error(`Banco tentativa ${i}: ${err.message}`);
      await new Promise(r => setTimeout(r, 8000));
    }
  }
})();
