// ── STATE ────────────────────────────────────────────────────────
const teamId = window.location.pathname.split('/').pop();
let selectedFiles = [];

const mUpload   = new bootstrap.Modal('#modalUpload');
const mViewSubs = new bootstrap.Modal('#modalViewSubs');

// ── LOAD PORTAL ───────────────────────────────────────────────────
async function loadPortal() {
  try {
    const data = await fetch(`/api/portal/${teamId}`).then(r => r.json());
    if (data.error) {
      document.getElementById('content').innerHTML =
        `<div class="alert alert-danger mt-4">Equipe não encontrada. Verifique o link.</div>`;
      return;
    }
    document.getElementById('teamTitle').textContent   = data.team.name;
    document.getElementById('teamDistrict').textContent = data.team.district_city;
    renderAssignments(data);
  } catch (e) {
    document.getElementById('content').innerHTML =
      `<div class="alert alert-danger mt-4">Erro ao conectar ao servidor.</div>`;
  }
}

function renderAssignments(data) {
  const { assignments } = data;
  const el = document.getElementById('content');

  if (assignments.length === 0) {
    el.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-clipboard2-x" style="font-size:48px;color:#adb5bd;"></i>
        <h5 class="mt-3 text-muted">Nenhum treinamento atribuído ainda.</h5>
        <p class="text-muted">Aguarde o administrador atribuir treinamentos para sua equipe.</p>
      </div>`;
    return;
  }

  const ordered = [...assignments].reverse();
  const total   = ordered.length;

  el.innerHTML = `
    <h4 class="fw-bold mb-4" style="color:#1a2a45;">
      <i class="bi bi-clipboard2-check-fill me-2"></i>Seus Treinamentos
      <span class="badge bg-secondary ms-2" style="font-size:14px;">${total} documento${total !== 1 ? 's' : ''}</span>
    </h4>
    ${ordered.map((a, idx) => {
      const num = idx + 1;
      const isSubmitted = a.status === 'submitted';
      return `
        <div class="session-card status-${a.status}" id="card_${a.id}">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
            <div>
              <div class="session-week">
                <span class="badge me-2" style="background:#1a3a6b;font-size:12px;">Documento #${num}</span>
                Semana ${a.week || ''} | ${a.month_year || ''}
              </div>
              <div class="session-title">${a.title}</div>
              <div class="session-detail mt-1">
                <i class="bi bi-calendar3"></i> ${a.date ? formatDate(a.date) : '—'} &nbsp;
                <i class="bi bi-clock"></i> ${a.time_start}–${a.time_end}
              </div>
              ${a.instructor_name ? `
                <div class="session-detail">
                  <i class="bi bi-person-fill"></i> Instrutor: <strong>${a.instructor_name}</strong>
                </div>` : ''}
              ${a.description ? `
                <div class="session-detail mt-2" style="max-width:600px;font-size:12px;">
                  ${a.description}
                </div>` : ''}
            </div>
            <div class="text-end">
              <div class="status-pill ${isSubmitted ? 'submitted' : 'pending'} mb-2">
                ${isSubmitted
                  ? '<i class="bi bi-check-circle-fill"></i> Enviado'
                  : '<i class="bi bi-clock-fill"></i> Pendente'}
              </div>
              ${isSubmitted && a.submitted_at ? `
                <div style="font-size:11px;color:#555;">
                  Enviado em ${formatDateTime(a.submitted_at)}
                </div>` : ''}
            </div>
          </div>

          <hr class="my-3">

          <div class="d-flex flex-wrap gap-2 align-items-center">
            <a href="/api/pdf/${a.session_id}/${teamId}"
               class="btn btn-outline-dark"
               title="Baixar a lista de frequência em PDF">
              <i class="bi bi-file-pdf-fill text-danger"></i> Baixar Lista
            </a>

            <button class="btn ${isSubmitted ? 'btn-outline-success' : 'btn-success'}"
                    onclick="openUpload(${a.id})">
              <i class="bi bi-upload"></i>
              ${isSubmitted ? 'Enviar Mais Fotos' : 'Enviar Lista Assinada'}
            </button>

            ${a.sub_count > 0 ? `
              <button class="btn btn-outline-secondary" onclick="viewSubs(${a.id})">
                <i class="bi bi-images"></i> Ver Enviados (${a.sub_count})
              </button>` : ''}
          </div>
        </div>`;
    }).join('')}`;
}

// ── UPLOAD ────────────────────────────────────────────────────────
function openUpload(assignmentId) {
  selectedFiles = [];
  document.getElementById('uploadAssignmentId').value = assignmentId;
  document.getElementById('fileInput').value = '';
  document.getElementById('filePreview').innerHTML = '';
  document.getElementById('btnSendFiles').disabled = true;
  document.getElementById('uploadProgress').style.display = 'none';
  mUpload.show();
}

function updatePreview() {
  const preview = document.getElementById('filePreview');
  preview.innerHTML = '';
  selectedFiles.forEach((file, idx) => {
    const thumb = document.createElement('div');
    thumb.className = 'file-thumb';
    const ext = file.name.split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','webp'].includes(ext)) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = `<div><i class="bi bi-file-pdf" style="font-size:28px;color:#c0392b;"></i><br><small>${file.name}</small></div>`;
    }
    const rm = document.createElement('div');
    rm.className = 'remove-file';
    rm.textContent = '×';
    rm.onclick = () => { selectedFiles.splice(idx, 1); updatePreview(); };
    thumb.appendChild(rm);
    preview.appendChild(thumb);
  });
  document.getElementById('btnSendFiles').disabled = selectedFiles.length === 0;
}

async function uploadFiles() {
  const assignmentId = document.getElementById('uploadAssignmentId').value;
  if (selectedFiles.length === 0) return;

  document.getElementById('uploadProgress').style.display = 'block';
  document.getElementById('btnSendFiles').disabled = true;

  const form = new FormData();
  form.append('assignment_id', assignmentId);
  selectedFiles.forEach(f => form.append('files', f));

  try {
    const r = await fetch('/api/submissions', { method: 'POST', body: form });
    const result = await r.json();
    if (result.success) {
      mUpload.hide();
      loadPortal(); // refresh
    } else {
      alert('Erro ao enviar: ' + (result.error || 'desconhecido'));
      document.getElementById('uploadProgress').style.display = 'none';
      document.getElementById('btnSendFiles').disabled = false;
    }
  } catch (e) {
    alert('Erro de conexão.');
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('btnSendFiles').disabled = false;
  }
}

// ── VIEW SUBMISSIONS ──────────────────────────────────────────────
async function viewSubs(assignmentId) {
  const subs = await fetch(`/api/submissions/${assignmentId}`).then(r => r.json());
  const body = document.getElementById('viewSubsBody');
  if (!subs.length) {
    body.innerHTML = '<p class="text-center text-muted py-4">Nenhum arquivo encontrado.</p>';
  } else {
    body.innerHTML = `<div class="sub-gallery p-2">${subs.map(s => {
      const ext = s.file_path.split('.').pop().toLowerCase();
      const isPdf = ext === 'pdf';
      return `
        <a href="${s.file_path}" target="_blank" class="sub-thumb" title="${s.original_name}">
          ${isPdf
            ? `<i class="bi bi-file-pdf pdf-icon"></i>`
            : `<img src="${s.file_path}" loading="lazy" alt="${s.original_name}">`}
        </a>`;
    }).join('')}</div>`;
  }
  mViewSubs.show();
}

// ── DRAG & DROP ───────────────────────────────────────────────────
const uploadArea = document.getElementById('uploadArea');
const fileInput  = document.getElementById('fileInput');

uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  Array.from(e.target.files).forEach(f => selectedFiles.push(f));
  updatePreview();
});
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  Array.from(e.dataTransfer.files).forEach(f => selectedFiles.push(f));
  updatePreview();
});

// ── HELPERS ───────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '—';
  const [y,m,day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function formatDateTime(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleString('pt-BR');
}

// ── INIT ─────────────────────────────────────────────────────────
if (!teamId || teamId === 'equipe') {
  document.getElementById('content').innerHTML =
    '<div class="alert alert-warning mt-4">Link inválido.</div>';
} else {
  loadPortal();
}
