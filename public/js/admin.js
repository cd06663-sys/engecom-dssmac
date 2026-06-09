// ── STATE ────────────────────────────────────────────────────────
const S = {
  view: 'dashboard',
  districts: [],
  teams: [],
  employees: [],
  sessions: [],
  assignSessionId: null,
};

// ── MODALS ───────────────────────────────────────────────────────
const mSession  = new bootstrap.Modal('#modalSession');
const mAssign   = new bootstrap.Modal('#modalAssign');
const mTeam     = new bootstrap.Modal('#modalTeam');
const mEmployee = new bootstrap.Modal('#modalEmployee');
const mSubs     = new bootstrap.Modal('#modalSubs');

// ── API ──────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  return r.json();
}

async function loadAll() {
  const [districts, teams, employees, sessions] = await Promise.all([
    api('GET','/api/districts'),
    api('GET','/api/teams'),
    api('GET','/api/employees'),
    api('GET','/api/sessions'),
  ]);
  S.districts = districts;
  S.teams     = teams;
  S.employees = employees;
  S.sessions  = sessions;
}

// ── ROUTER ───────────────────────────────────────────────────────
function showView(view) {
  S.view = view;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  const fn = { dashboard: renderDashboard, sessions: renderSessions,
               teams: renderTeams, employees: renderEmployees, links: renderLinks };
  fn[view]?.();
}

// ── DASHBOARD ────────────────────────────────────────────────────
async function renderDashboard() {
  const v = document.getElementById('view');
  v.innerHTML = '<div class="text-center py-5 text-muted"><div class="spinner-border mb-3"></div><br>Conectando ao banco...</div>';

  let data, lastErr;
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch('/api/dashboard');
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      data = json;
      break;
    } catch (e) {
      lastErr = e.message;
      if (i < 7) {
        v.innerHTML = `<div class="text-center py-5 text-muted"><div class="spinner-border mb-3"></div><br>Conectando ao banco... (tentativa ${i+2}/8)</div>`;
        await new Promise(r => setTimeout(r, 4000));
      }
    }
  }
  if (!data) {
    v.innerHTML = `<div class="alert alert-danger m-4">
      <strong>Banco de dados indisponível</strong><br>
      <small>${lastErr||'Erro desconhecido'}</small><br><br>
      <button class="btn btn-sm btn-danger" onclick="renderDashboard()">Tentar novamente</button>
    </div>`;
    return;
  }
  v.innerHTML = `
    <div class="page-header">
      <h2><i class="bi bi-grid-1x2-fill me-2"></i>Dashboard</h2>
      <button class="btn btn-sm btn-outline-secondary" onclick="renderDashboard()">
        <i class="bi bi-arrow-clockwise"></i> Atualizar
      </button>
    </div>
    <div class="d-flex gap-3 flex-wrap">
      ${data.map(district => `
        <div class="district-col">
          <div class="district-header">
            <i class="bi bi-geo-alt-fill"></i> ${district.name}
          </div>
          ${district.teams.map(t => {
            const total = t.pending + t.submitted;
            const allSubmitted = total > 0 && t.pending === 0;
            const cls = allSubmitted ? 'has-submitted' : t.submitted > 0 ? 'has-submitted' : t.pending > 0 ? 'has-pending' : '';
            return `
              <div class="team-card ${cls}" style="cursor:pointer;" onclick="window.open('/equipe/${t.id}','_blank')">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <div class="team-card-name">${t.name} <i class="bi bi-box-arrow-up-right" style="font-size:11px;color:#aaa;"></i></div>
                    <div class="team-card-sub">
                      <i class="bi bi-person-fill"></i> ${t.employees} funcionários
                    </div>
                  </div>
                  <div class="text-end">
                    ${t.submitted > 0 ? `<span class="badge badge-submitted me-1"><i class="bi bi-check-circle-fill"></i> ${t.submitted} ok</span>` : ''}
                    ${t.pending   > 0 ? `<span class="badge badge-pending"><i class="bi bi-clock-fill"></i> ${t.pending} pend.</span>` : ''}
                    ${total === 0     ? `<span class="badge bg-light text-muted border">Sem treinamento</span>` : ''}
                  </div>
                </div>
                ${total > 0 ? `
                  <div class="progress mt-2" style="height:6px;">
                    <div class="progress-bar bg-success" style="width:${Math.round(t.submitted/total*100)}%"></div>
                  </div>
                  <div class="team-card-sub mt-1">${t.submitted}/${total} enviados</div>
                ` : ''}
              </div>`;
          }).join('')}
        </div>
      `).join('')}
    </div>`;
}

// ── SESSIONS ─────────────────────────────────────────────────────
async function renderSessions() {
  await loadAll();
  const v = document.getElementById('view');
  v.innerHTML = `
    <div class="page-header">
      <h2><i class="bi bi-clipboard2-check-fill me-2"></i>Treinamentos</h2>
      <button class="btn btn-primary" onclick="openSessionModal()">
        <i class="bi bi-plus-lg"></i> Novo Treinamento
      </button>
    </div>
    ${S.sessions.length === 0 ? '<p class="text-muted">Nenhum treinamento criado ainda.</p>' : ''}
    ${S.sessions.map(s => {
      const total = s.assignments.length;
      const subs  = s.assignments.filter(a => a.status === 'submitted').length;
      return `
        <div class="session-row">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <div class="session-title">${s.title} — Semana ${s.week || ''} | ${s.month_year || ''}</div>
              <div class="session-meta">
                <i class="bi bi-calendar3"></i> ${s.date ? formatDate(s.date) : '—'} &nbsp;
                <i class="bi bi-clock"></i> ${s.time_start}–${s.time_end} &nbsp;
                <i class="bi bi-people-fill"></i> ${total} equipes
              </div>
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <button class="btn btn-sm btn-outline-primary" onclick="openAssignModal(${s.id})">
                <i class="bi bi-diagram-3"></i> Atribuir Equipes
              </button>
              ${total > 0 ? `
              <a href="/api/pdf/${s.id}/zip" class="btn btn-sm btn-outline-success" title="Baixar todas as listas em ZIP">
                <i class="bi bi-file-zip"></i> Baixar Todas
              </a>` : ''}
              <button class="btn btn-sm btn-outline-secondary" onclick="openSessionModal(${s.id})">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger" onclick="deleteSession(${s.id})">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
          ${total > 0 ? `
            <div>
              <div class="d-flex justify-content-between mb-1">
                <small class="text-muted">Progresso de envio</small>
                <small class="text-muted">${subs}/${total}</small>
              </div>
              <div class="progress mb-2" style="height:8px;">
                <div class="progress-bar bg-success" style="width:${total>0?Math.round(subs/total*100):0}%"></div>
              </div>
              <div class="d-flex flex-wrap gap-2">
                ${s.assignments.map(a => `
                  <div class="assignment-row ${a.status}">
                    <div>
                      <strong style="font-size:12px;">${a.district_name} › ${a.team_name}</strong><br>
                      <small class="text-muted">${a.instructor_name || 'Sem instrutor'}</small>
                    </div>
                    <span class="badge ${a.status === 'submitted' ? 'bg-success' : 'bg-warning text-dark'}">
                      ${a.status === 'submitted' ? '✓ Enviado' : '⏳ Pendente'}
                    </span>
                    <div class="d-flex gap-1">
                      <a href="/api/pdf/${s.id}/${a.team_id}" class="btn btn-sm btn-outline-dark" title="Baixar PDF">
                        <i class="bi bi-file-pdf"></i>
                      </a>
                      ${a.sub_count > 0 ? `
                        <button class="btn btn-sm btn-outline-success" onclick="viewSubs(${a.id})" title="${a.sub_count} arquivo(s)">
                          <i class="bi bi-images"></i> ${a.sub_count}
                        </button>` : ''}
                      ${a.status === 'submitted' ? `
                        <button class="btn btn-sm btn-outline-warning" onclick="resetAssignment(${a.id}, ${s.id})" title="Resetar">
                          <i class="bi bi-arrow-counterclockwise"></i>
                        </button>` : ''}
                    </div>
                  </div>`).join('')}
              </div>
            </div>
          ` : '<p class="text-muted small mb-0">Nenhuma equipe atribuída. Clique em "Atribuir Equipes".</p>'}
        </div>`;
    }).join('')}`;
}

function openSessionModal(id) {
  const s = id ? S.sessions.find(x => x.id === id) : null;
  document.getElementById('sessionId').value        = s?.id || '';
  document.getElementById('sessionTitle').value      = s?.title      || 'DSSMAC';
  document.getElementById('sessionWeek').value       = s?.week       || '';
  document.getElementById('sessionMonthYear').value  = s?.month_year || '';
  document.getElementById('sessionDate').value       = s?.date       || '';
  document.getElementById('sessionTimeStart').value  = s?.time_start || '07:00';
  document.getElementById('sessionTimeEnd').value    = s?.time_end   || '07:30';
  document.getElementById('sessionDescription').value= s?.description|| '';
  document.getElementById('sessionWorkload').value   = s?.workload   || '00h 30m';
  document.getElementById('sessionObraVale').value   = s?.obra_vale  || '11 5900130281';
  document.getElementById('modalSessionTitle').textContent = s ? 'Editar Treinamento' : 'Novo Treinamento';
  document.getElementById('autoAssignRow').style.display = id ? 'none' : '';
  document.getElementById('autoAssignAll').checked = true;
  mSession.show();
}

async function saveSession() {
  const id = document.getElementById('sessionId').value;
  const body = {
    title:       document.getElementById('sessionTitle').value.trim(),
    week:        document.getElementById('sessionWeek').value.trim(),
    month_year:  document.getElementById('sessionMonthYear').value.trim(),
    date:        document.getElementById('sessionDate').value,
    time_start:  document.getElementById('sessionTimeStart').value,
    time_end:    document.getElementById('sessionTimeEnd').value,
    description: document.getElementById('sessionDescription').value.trim(),
    workload:    document.getElementById('sessionWorkload').value.trim(),
    obra_vale:   document.getElementById('sessionObraVale').value.trim(),
  };
  if (!body.title) return alert('Informe o título.');
  const result = await api(id ? 'PUT' : 'POST', id ? `/api/sessions/${id}` : '/api/sessions', body);

  if (!id && document.getElementById('autoAssignAll')?.checked && result.id) {
    if (!S.teams.length) await loadAll();
    const assignments = S.teams.map(t => ({
      team_id: t.id,
      instructor_name: t.instructor || null,
    }));
    await api('POST', `/api/sessions/${result.id}/assign`, { assignments });
  }

  mSession.hide();
  renderSessions();
}

async function deleteSession(id) {
  if (!confirm('Excluir este treinamento e todas as atribuições?')) return;
  await api('DELETE', `/api/sessions/${id}`);
  renderSessions();
}

async function openAssignModal(sessionId) {
  S.assignSessionId = sessionId;
  await loadAll();
  const session = S.sessions.find(s => s.id === sessionId);
  const grouped = {};
  S.districts.forEach(d => grouped[d.id] = { name: d.name, teams: [] });
  S.teams.forEach(t => grouped[t.district_id]?.teams.push(t));

  const body = document.getElementById('assignBody');
  body.innerHTML = S.districts.map(d => `
    <div class="mb-3">
      <div class="fw-bold mb-2 text-primary"><i class="bi bi-geo-alt-fill"></i> ${d.name}</div>
      ${(grouped[d.id]?.teams || []).map(t => {
        const existing = session?.assignments.find(a => a.team_id === t.id);
        const checked  = existing ? 'checked' : '';
        const instr    = existing?.instructor_name || t.instructor || '';
        return `
          <div class="d-flex align-items-center gap-2 mb-2 p-2 bg-light rounded">
            <input class="form-check-input" type="checkbox" id="chk_${t.id}" value="${t.id}" ${checked}>
            <label class="form-check-label flex-grow-1 mb-0" for="chk_${t.id}">
              <strong>${t.name}</strong> <small class="text-muted">#${t.team_number}</small>
            </label>
            <input class="form-control form-control-sm" style="max-width:260px"
              id="instr_${t.id}" placeholder="Instrutor" value="${instr}">
          </div>`;
      }).join('')}
    </div>`).join('');
  mAssign.show();
}

async function saveAssignments() {
  const list = [];
  document.querySelectorAll('#assignBody input[type=checkbox]:checked').forEach(chk => {
    list.push({
      team_id:         chk.value,
      instructor_name: document.getElementById(`instr_${chk.value}`)?.value.trim() || null,
    });
  });
  await api('POST', `/api/sessions/${S.assignSessionId}/assign`, { assignments: list });
  mAssign.hide();
  renderSessions();
}

async function resetAssignment(assignId, sessionId) {
  if (!confirm('Resetar status desta equipe para "pendente"?')) return;
  await api('POST', `/api/assignments/${assignId}/reset`);
  renderSessions();
}

async function viewSubs(assignId) {
  const subs = await api('GET', `/api/submissions/${assignId}`);
  const body = document.getElementById('subsBody');
  if (subs.length === 0) {
    body.innerHTML = '<p class="text-muted text-center py-4">Nenhum arquivo enviado.</p>';
  } else {
    body.innerHTML = `<div class="d-flex flex-wrap gap-3 p-2">${subs.map(s => {
      const ext = s.file_path.split('.').pop().toLowerCase();
      const isPdf = ext === 'pdf';
      return `
        <div style="text-align:center">
          <a href="${s.file_path}" target="_blank" style="text-decoration:none">
            <div class="sub-thumb d-flex align-items-center justify-content-center"
                 style="width:130px;height:130px;border-radius:10px;overflow:hidden;border:2px solid #dee2e6;background:#f8f9fa;">
              ${isPdf
                ? `<i class="bi bi-file-pdf" style="font-size:40px;color:#c0392b;"></i>`
                : `<img src="${s.file_path}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">`}
            </div>
          </a>
          <div style="font-size:11px;color:#666;margin-top:4px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${s.original_name}">${s.original_name || 'arquivo'}</div>
          <button class="btn btn-sm btn-link text-danger p-0" onclick="deleteSub(${s.id})">
            <i class="bi bi-trash"></i>
          </button>
        </div>`;
    }).join('')}</div>`;
  }
  mSubs.show();
}

async function deleteSub(id) {
  if (!confirm('Remover este arquivo?')) return;
  await api('DELETE', `/api/submissions/${id}`);
  mSubs.hide();
  renderSessions();
}

// ── TEAMS ────────────────────────────────────────────────────────
async function renderTeams() {
  await loadAll();
  const grouped = {};
  S.districts.forEach(d => grouped[d.id] = { ...d, teams: [] });
  S.teams.forEach(t => grouped[t.district_id]?.teams.push(t));

  document.getElementById('view').innerHTML = `
    <div class="page-header">
      <h2><i class="bi bi-people-fill me-2"></i>Equipes</h2>
      <button class="btn btn-primary" onclick="openTeamModal()">
        <i class="bi bi-plus-lg"></i> Nova Equipe
      </button>
    </div>
    ${S.districts.map(d => {
      const teams = grouped[d.id]?.teams || [];
      return `
        <div class="card mb-4">
          <div class="card-header d-flex align-items-center gap-2"
               style="background:var(--brand-blue);color:#fff;">
            <i class="bi bi-geo-alt-fill"></i> ${d.name}
            <small class="ms-1 text-white-50">(${d.city})</small>
          </div>
          <div class="card-body p-0">
            <table class="table table-hover mb-0">
              <thead><tr>
                <th>#</th><th>Nome</th><th>Especialidade</th><th>Localidade</th><th>Instrutor</th>
                <th>Funcionários</th><th class="text-end">Ações</th>
              </tr></thead>
              <tbody>
                ${teams.map(t => {
                  const empCount = S.employees.filter(e => e.team_id === t.id).length;
                  return `
                    <tr>
                      <td>${t.team_number}</td>
                      <td><strong>${t.name}</strong></td>
                      <td>${t.specialty || '<span class="text-muted">—</span>'}</td>
                      <td>${t.location  || '<span class="text-muted">—</span>'}</td>
                      <td>${t.instructor || '<span class="text-muted">—</span>'}</td>
                      <td>
                        <a href="#" onclick="filterEmployeesByTeam(${t.id}); return false;">
                          ${empCount} pessoa(s)
                        </a>
                      </td>
                      <td class="text-end">
                        <button class="btn btn-sm btn-outline-secondary me-1" onclick="openTeamModal(${t.id})">
                          <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteTeam(${t.id})">
                          <i class="bi bi-trash"></i>
                        </button>
                      </td>
                    </tr>`;
                }).join('')}
                ${teams.length === 0 ? '<tr><td colspan="7" class="text-center text-muted py-3">Nenhuma equipe</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>`;
    }).join('')}`;

  // populate district select
  const sel = document.getElementById('teamDistrict');
  if (sel) {
    sel.innerHTML = S.districts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  }
}

function openTeamModal(id) {
  const t = id ? S.teams.find(x => x.id === id) : null;
  document.getElementById('teamId').value          = t?.id || '';
  document.getElementById('teamName').value         = t?.name        || '';
  document.getElementById('teamNumber').value       = t?.team_number || 1;
  document.getElementById('teamInstructor').value   = t?.instructor  || '';
  document.getElementById('teamSpecialty').value    = t?.specialty   || '';
  document.getElementById('teamLocation').value     = t?.location    || '';
  const sel = document.getElementById('teamDistrict');
  sel.innerHTML = S.districts.map(d =>
    `<option value="${d.id}" ${t?.district_id === d.id ? 'selected' : ''}>${d.name}</option>`
  ).join('');
  document.getElementById('modalTeamTitle').textContent = t ? 'Editar Equipe' : 'Nova Equipe';
  mTeam.show();
}

async function saveTeam() {
  const id   = document.getElementById('teamId').value;
  const body = {
    name:        document.getElementById('teamName').value.trim(),
    district_id: document.getElementById('teamDistrict').value,
    team_number: document.getElementById('teamNumber').value,
    instructor:  document.getElementById('teamInstructor').value.trim(),
    specialty:   document.getElementById('teamSpecialty').value.trim(),
    location:    document.getElementById('teamLocation').value.trim(),
  };
  if (!body.name) return alert('Informe o nome da equipe.');
  await api(id ? 'PUT' : 'POST', id ? `/api/teams/${id}` : '/api/teams', body);
  mTeam.hide();
  renderTeams();
}

async function deleteTeam(id) {
  if (!confirm('Excluir esta equipe?')) return;
  await api('DELETE', `/api/teams/${id}`);
  renderTeams();
}

// ── EMPLOYEES ────────────────────────────────────────────────────
async function renderEmployees(teamFilter) {
  await loadAll();
  const filtered = teamFilter
    ? S.employees.filter(e => e.team_id === teamFilter)
    : S.employees;

  document.getElementById('view').innerHTML = `
    <div class="page-header">
      <h2><i class="bi bi-person-badge-fill me-2"></i>Funcionários
        ${teamFilter ? `<small class="text-muted fs-6">— ${S.teams.find(t=>t.id===teamFilter)?.name || ''}</small>` : ''}
      </h2>
      <div class="d-flex gap-2">
        ${teamFilter ? `<button class="btn btn-sm btn-outline-secondary" onclick="renderEmployees()">Ver todos</button>` : ''}
        <select class="form-select form-select-sm" style="width:auto" onchange="filterEmpByTeam(this.value)">
          <option value="">Todas as equipes</option>
          ${S.teams.map(t =>
            `<option value="${t.id}" ${t.id===teamFilter?'selected':''}>${t.district_name} › ${t.name}</option>`
          ).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="openEmployeeModal()">
          <i class="bi bi-plus-lg"></i> Novo
        </button>
      </div>
    </div>
    <div class="card">
      <div class="card-body p-0">
        <table class="table table-hover emp-table mb-0">
          <thead><tr>
            <th>Matrícula</th><th>Nome</th><th>Função</th><th>Equipe</th><th>Empresa</th><th class="text-end">Ações</th>
          </tr></thead>
          <tbody>
            ${filtered.map(e => `
              <tr>
                <td>${e.matricula || '—'}</td>
                <td><strong>${e.name}</strong></td>
                <td>${e.function || '—'}</td>
                <td>${e.team_name ? `${e.district_name} › ${e.team_name}` : '—'}</td>
                <td>${e.company}</td>
                <td class="text-end">
                  <button class="btn btn-sm btn-outline-secondary me-1" onclick="openEmployeeModal(${e.id})">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger" onclick="deleteEmployee(${e.id})">
                    <i class="bi bi-trash"></i>
                  </button>
                </td>
              </tr>`).join('')}
            ${filtered.length === 0 ? '<tr><td colspan="6" class="text-center text-muted py-4">Nenhum funcionário.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
    <div class="text-muted small mt-2">${filtered.length} funcionário(s) encontrado(s)</div>`;

  // populate team select in employee modal
  const empTeam = document.getElementById('empTeam');
  if (empTeam) {
    empTeam.innerHTML = '<option value="">— Sem equipe —</option>' +
      S.teams.map(t =>
        `<option value="${t.id}">${t.district_name} › ${t.name}</option>`
      ).join('');
  }
}

function filterEmpByTeam(val) {
  renderEmployees(val ? Number(val) : null);
}

function filterEmployeesByTeam(id) {
  showView('employees');
  setTimeout(() => renderEmployees(id), 100);
}

function openEmployeeModal(id) {
  const e = id ? S.employees.find(x => x.id === id) : null;
  document.getElementById('empId').value        = e?.id        || '';
  document.getElementById('empMatricula').value  = e?.matricula || '';
  document.getElementById('empName').value       = e?.name      || '';
  document.getElementById('empFunction').value   = e?.function  || '';
  document.getElementById('empCompany').value    = e?.company   || 'ENGECOM';
  const sel = document.getElementById('empTeam');
  sel.innerHTML = '<option value="">— Sem equipe —</option>' +
    S.teams.map(t =>
      `<option value="${t.id}" ${e?.team_id===t.id?'selected':''}>${t.district_name} › ${t.name}</option>`
    ).join('');
  document.getElementById('modalEmployeeTitle').textContent = e ? 'Editar Funcionário' : 'Novo Funcionário';
  mEmployee.show();
}

async function saveEmployee() {
  const id   = document.getElementById('empId').value;
  const body = {
    matricula: document.getElementById('empMatricula').value.trim(),
    name:      document.getElementById('empName').value.trim().toUpperCase(),
    function:  document.getElementById('empFunction').value.trim().toUpperCase(),
    company:   document.getElementById('empCompany').value.trim().toUpperCase() || 'ENGECOM',
    team_id:   document.getElementById('empTeam').value || null,
  };
  if (!body.name) return alert('Informe o nome.');
  await api(id ? 'PUT' : 'POST', id ? `/api/employees/${id}` : '/api/employees', body);
  mEmployee.hide();
  renderEmployees();
}

async function deleteEmployee(id) {
  if (!confirm('Remover este funcionário da lista?')) return;
  await api('DELETE', `/api/employees/${id}`);
  renderEmployees();
}

// ── LINKS ────────────────────────────────────────────────────────
async function renderLinks() {
  await loadAll();
  const base = window.location.origin;
  const grouped = {};
  S.districts.forEach(d => grouped[d.id] = { ...d, teams: [] });
  S.teams.forEach(t => grouped[t.district_id]?.teams.push(t));

  document.getElementById('view').innerHTML = `
    <div class="page-header">
      <h2><i class="bi bi-link-45deg me-2"></i>Links das Equipes</h2>
    </div>
    <p class="text-muted mb-4">Copie o link e envie para cada equipe. Elas poderão baixar as listas e enviar as fotos.</p>
    ${S.districts.map(d => {
      const teams = grouped[d.id]?.teams || [];
      return `
        <h5 class="fw-bold text-primary mb-3"><i class="bi bi-geo-alt-fill"></i> ${d.name}</h5>
        ${teams.map(t => {
          const url = `${base}/equipe/${t.id}`;
          return `
            <div class="link-card">
              <div>
                <strong>${t.name}</strong> <small class="text-muted">#${t.team_number}</small>
              </div>
              <div class="link-url" id="link_${t.id}">${url}</div>
              <button class="btn btn-sm btn-outline-primary" onclick="copyLink('${url}', this)">
                <i class="bi bi-clipboard"></i> Copiar
              </button>
              <a href="${url}" target="_blank" class="btn btn-sm btn-outline-secondary">
                <i class="bi bi-box-arrow-up-right"></i> Abrir
              </a>
            </div>`;
        }).join('')}
        <hr class="my-4">`;
    }).join('')}`;
}

function copyLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-check-lg"></i> Copiado!';
    btn.classList.replace('btn-outline-primary','btn-success');
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.classList.replace('btn-success','btn-outline-primary');
    }, 2000);
  });
}

// ── HELPERS ───────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '—';
  const [y,m,day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// ── INIT ─────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => showView(el.dataset.view));
});

renderDashboard();
