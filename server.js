require('dotenv').config();
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const multer  = require('multer');
const cors    = require('cors');

const { supabase, initDB } = require('./database');
const { generatePDF }      = require('./pdf-generator');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── HELPERS ───────────────────────────────────────────────────────
const sb = async (q) => {
  const { data, error } = await q;
  if (error) throw error;
  return data;
};
const sb1 = async (q) => {
  const { data, error } = await q;
  if (error) throw error;
  return data;
};
const sbCount = async (q) => {
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
};

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

// ── DISTRICTS ─────────────────────────────────────────────────────
app.get('/api/districts', async (_, res) => {
  try {
    const data = await sb(supabase.from('districts').select('*').order('name'));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TEAMS ─────────────────────────────────────────────────────────
app.get('/api/teams', async (_, res) => {
  try {
    const data = await sb(supabase.from('teams').select('*, districts(name, city)').order('team_number'));
    res.json(data.map(t => ({ ...t, district_name: t.districts?.name, district_city: t.districts?.city })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/teams/:id', async (req, res) => {
  try {
    const data = await sb(supabase.from('teams').select('*, districts(name, city)').eq('id', req.params.id).single());
    if (!data) return res.status(404).json({ error: 'Equipe não encontrada' });
    res.json({ ...data, district_name: data.districts?.name, district_city: data.districts?.city });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/teams', async (req, res) => {
  const { name, district_id, team_number, instructor } = req.body;
  try {
    const data = await sb(supabase.from('teams').insert({ name, district_id, team_number, instructor: instructor || null }).select('id').single());
    res.json({ id: data.id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/teams/:id', async (req, res) => {
  const { name, team_number, instructor } = req.body;
  try {
    await sb(supabase.from('teams').update({ name, team_number, instructor: instructor || null }).eq('id', req.params.id));
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/teams/:id', async (req, res) => {
  try {
    await sb(supabase.from('teams').delete().eq('id', req.params.id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EMPLOYEES ─────────────────────────────────────────────────────
app.get('/api/employees', async (req, res) => {
  try {
    let q = supabase.from('employees').select('*, teams(name, districts(name))').eq('active', 1).order('name');
    if (req.query.team_id) q = q.eq('team_id', req.query.team_id);
    const data = await sb(q);
    res.json(data.map(e => ({ ...e, team_name: e.teams?.name, district_name: e.teams?.districts?.name })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees', async (req, res) => {
  const { matricula, name, function: fn, company, team_id } = req.body;
  try {
    const data = await sb(supabase.from('employees').insert({ matricula, name, function: fn, company: company || 'ENGECOM', team_id: team_id || null }).select('id').single());
    res.json({ id: data.id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/employees/:id', async (req, res) => {
  const { matricula, name, function: fn, company, team_id } = req.body;
  try {
    await sb(supabase.from('employees').update({ matricula, name, function: fn, company: company || 'ENGECOM', team_id: team_id || null }).eq('id', req.params.id));
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    await sb(supabase.from('employees').update({ active: 0 }).eq('id', req.params.id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SESSIONS ──────────────────────────────────────────────────────
async function getAssignmentsForSession(sessionId) {
  const assignments = await sb(
    supabase.from('assignments')
      .select('*, teams(name, team_number, districts(name))')
      .eq('session_id', sessionId)
      .order('team_id')
  );
  return Promise.all(assignments.map(async a => {
    const count = await sbCount(supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('assignment_id', a.id));
    return { ...a, team_name: a.teams?.name, district_name: a.teams?.districts?.name, sub_count: count };
  }));
}

app.get('/api/sessions', async (_, res) => {
  try {
    const sessions = await sb(supabase.from('sessions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }));
    for (const s of sessions) s.assignments = await getAssignmentsForSession(s.id);
    res.json(sessions);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const s = await sb(supabase.from('sessions').select('*').eq('id', req.params.id).single());
    if (!s) return res.status(404).json({ error: 'Sessão não encontrada' });
    s.assignments = await getAssignmentsForSession(s.id);
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sessions', async (req, res) => {
  const { title, week, month_year, date, time_start, time_end, description, workload, obra_vale } = req.body;
  try {
    const data = await sb(supabase.from('sessions').insert({
      title, week, month_year, date,
      time_start: time_start || '07:00', time_end: time_end || '07:30',
      description, workload: workload || '00h 30m', obra_vale: obra_vale || '11 5900130281',
    }).select('id').single());
    res.json({ id: data.id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/sessions/:id', async (req, res) => {
  const { title, week, month_year, date, time_start, time_end, description, workload, obra_vale } = req.body;
  try {
    await sb(supabase.from('sessions').update({ title, week, month_year, date, time_start, time_end, description, workload, obra_vale }).eq('id', req.params.id));
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await sb(supabase.from('sessions').delete().eq('id', req.params.id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sessions/:id/assign', async (req, res) => {
  const { assignments: list } = req.body;
  try {
    const newIds = list.map(a => Number(a.team_id));
    const existing = await sb(supabase.from('assignments').select('id, team_id').eq('session_id', req.params.id));
    const toDelete = existing.filter(e => !newIds.includes(e.team_id));
    if (toDelete.length) await sb(supabase.from('assignments').delete().in('id', toDelete.map(e => e.id)));
    const existingTeamIds = existing.map(e => e.team_id);
    for (const a of list) {
      if (existingTeamIds.includes(Number(a.team_id))) {
        await sb(supabase.from('assignments').update({ instructor_name: a.instructor_name || null }).eq('session_id', req.params.id).eq('team_id', a.team_id));
      } else {
        await sb(supabase.from('assignments').insert({ session_id: Number(req.params.id), team_id: Number(a.team_id), instructor_name: a.instructor_name || null }));
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── PDF ────────────────────────────────────────────────────────────
app.get('/api/pdf/:sessionId/:teamId', async (req, res) => {
  const { sessionId, teamId } = req.params;
  try {
    const session    = await sb(supabase.from('sessions').select('*').eq('id', sessionId).single());
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    const team       = await sb(supabase.from('teams').select('*, districts(name, city)').eq('id', teamId).single());
    if (!team) return res.status(404).json({ error: 'Equipe não encontrada' });
    const assignment = await sb(supabase.from('assignments').select('*').eq('session_id', sessionId).eq('team_id', teamId).maybeSingle());
    const employees  = await sb(supabase.from('employees').select('*').eq('team_id', teamId).eq('active', 1).order('name'));
    const instructor = assignment?.instructor_name || '';
    const teamForPDF = { ...team, district_name: team.districts?.name, district_city: team.districts?.city };

    const filePath = path.join(os.tmpdir(), `lista_${sessionId}_${teamId}_${Date.now()}.pdf`);
    await generatePDF({ session, team: teamForPDF, employees, instructor }, filePath);
    res.download(filePath, `Lista_DSSMAC_${team.name.replace(/\s+/g,'_')}.pdf`, () => {
      try { fs.unlinkSync(filePath); } catch(_) {}
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SUBMISSIONS ───────────────────────────────────────────────────
app.post('/api/submissions', upload.array('files', 20), async (req, res) => {
  const { assignment_id } = req.body;
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  try {
    for (const f of req.files) {
      const ext      = path.extname(f.originalname).toLowerCase();
      const fileName = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      const { error: upErr } = await supabase.storage.from('uploads').upload(fileName, f.buffer, { contentType: f.mimetype });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(fileName);
      await sb(supabase.from('submissions').insert({ assignment_id: Number(assignment_id), file_path: publicUrl, original_name: f.originalname }));
    }
    await sb(supabase.from('assignments').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', assignment_id));
    res.json({ success: true, count: req.files.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/submissions/:assignmentId', async (req, res) => {
  try {
    const data = await sb(supabase.from('submissions').select('*').eq('assignment_id', req.params.assignmentId).order('uploaded_at', { ascending: false }));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/submissions/:id', async (req, res) => {
  try {
    const row = await sb(supabase.from('submissions').select('*').eq('id', req.params.id).single());
    if (row) {
      const fileName = row.file_path.split('/').pop();
      await supabase.storage.from('uploads').remove([fileName]);
      await sb(supabase.from('submissions').delete().eq('id', req.params.id));
      const count = await sbCount(supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('assignment_id', row.assignment_id));
      if (count === 0) await sb(supabase.from('assignments').update({ status: 'pending', submitted_at: null }).eq('id', row.assignment_id));
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assignments/:id/reset', async (req, res) => {
  try {
    await sb(supabase.from('assignments').update({ status: 'pending', submitted_at: null }).eq('id', req.params.id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DASHBOARD ─────────────────────────────────────────────────────
app.get('/api/dashboard', async (_, res) => {
  try {
    const districts = await sb(supabase.from('districts').select('*').order('name'));
    const result = await Promise.all(districts.map(async d => {
      const teams = await sb(supabase.from('teams').select('*').eq('district_id', d.id).order('team_number'));
      const teamsData = await Promise.all(teams.map(async t => {
        const [pending, submitted, employees] = await Promise.all([
          sbCount(supabase.from('assignments').select('*', { count: 'exact', head: true }).eq('team_id', t.id).eq('status', 'pending')),
          sbCount(supabase.from('assignments').select('*', { count: 'exact', head: true }).eq('team_id', t.id).eq('status', 'submitted')),
          sbCount(supabase.from('employees').select('*', { count: 'exact', head: true }).eq('team_id', t.id).eq('active', 1)),
        ]);
        return { ...t, pending, submitted, employees };
      }));
      return { ...d, teams: teamsData };
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TEAM PORTAL ───────────────────────────────────────────────────
app.get('/api/portal/:teamId', async (req, res) => {
  try {
    const team = await sb(supabase.from('teams').select('*, districts(name, city)').eq('id', req.params.teamId).single());
    if (!team) return res.status(404).json({ error: 'Equipe não encontrada' });

    const assignments = await sb(
      supabase.from('assignments')
        .select('*, sessions(*)')
        .eq('team_id', req.params.teamId)
        .order('created_at', { ascending: false })
    );

    const enriched = await Promise.all(assignments.map(async a => {
      const count = await sbCount(supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('assignment_id', a.id));
      const s = a.sessions || {};
      return { ...a, title: s.title, date: s.date, week: s.week, month_year: s.month_year,
               time_start: s.time_start, time_end: s.time_end, description: s.description, sub_count: count };
    }));

    res.json({ team: { ...team, district_name: team.districts?.name, district_city: team.districts?.city }, assignments: enriched });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/equipe/:teamId', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'equipe.html'));
});

// ── START ─────────────────────────────────────────────────────────
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log('\n======================================');
    console.log('  ENGECOM DSSMAC - Sistema de Gestao');
    console.log('======================================');
    console.log(`  Admin:  http://localhost:${PORT}`);
    console.log(`  Equipe: http://localhost:${PORT}/equipe/{ID}\n`);
  });
}

start().catch(console.error);
