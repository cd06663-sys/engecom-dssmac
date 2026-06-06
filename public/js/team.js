const teamId = window.location.pathname.split('/').pop();
let selectedFiles = [];

const mUpload   = new bootstrap.Modal('#modalUpload');
const mViewSubs = new bootstrap.Modal('#modalViewSubs');

// ── CARREGAR PORTAL ───────────────────────────────────────────────
async function loadPortal() {
  try {
    const data = await fetch(`/api/portal/${teamId}`).then(r => r.json());
    if (data.error) {
      document.getElementById('content').innerHTML =
        `<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>Link inválido. Verifique o endereço.</p></div>`;
      return;
    }
    document.getElementById('teamTitle').textContent    = data.team.name;
    document.getElementById('teamDistrict').textContent = data.team.district_city || data.team.district_name || '';
    document.title = `${data.team.name} — ENGECOM`;
    renderListas(data.assignments);
  } catch (e) {
    document.getElementById('content').innerHTML =
      `<div class="empty-state"><i class="bi bi-wifi-off"></i><p>Erro ao conectar. Tente novamente.</p></div>`;
  }
}

// ── RENDERIZAR LISTAS ─────────────────────────────────────────────
function renderListas(assignments) {
  const el = document.getElementById('content');

  if (!assignments.length) {
    el.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-inbox"></i>
        <p style="font-size:16px;font-weight:600;">Nenhuma lista disponível ainda.</p>
        <p style="font-size:13px;">Aguarde o administrador criar os treinamentos.</p>
      </div>`;
    return;
  }

  const ordered = [...assignments].reverse();

  el.innerHTML = ordered.map((a, idx) => {
    const num         = idx + 1;
    const isSubmitted = a.status === 'submitted';
    const title       = a.title || 'Treinamento';
    const info        = [
      a.date ? formatDate(a.date) : null,
      (a.time_start && a.time_end) ? `${a.time_start} – ${a.time_end}` : null,
      a.instructor_name ? `Instrutor: ${a.instructor_name}` : null,
    ].filter(Boolean).join('  •  ');

    return `
      <div class="lista-card status-${a.status}" id="card_${a.id}">
        <div class="lista-card-body">
          <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
            <div style="flex:1;">
              <div class="lista-num">Lista ${num}</div>
              <div class="lista-title">${title}</div>
              ${info ? `<div class="lista-info">${info}</div>` : ''}
            </div>
            <div>
              <div class="lista-status ${isSubmitted ? 'submitted' : 'pending'}">
                ${isSubmitted
                  ? '<i class="bi bi-check-circle-fill"></i> Enviado'
                  : '<i class="bi bi-clock-fill"></i> Pendente'}
              </div>
            </div>
          </div>
        </div>

        <div class="lista-actions">
          <a href="/api/pdf/${a.session_id}/${teamId}" class="btn-baixar">
            <i class="bi bi-file-pdf-fill" style="color:#c0392b;font-size:18px;"></i>
            Baixar Lista
          </a>

          <button class="btn-enviar ${isSubmitted ? 'submitted' : 'pending'}"
                  onclick="openUpload(${a.id}, '${title.replace(/'/g,"\\'")} — Lista ${num}')">
            <i class="bi bi-upload" style="font-size:18px;"></i>
            ${isSubmitted ? 'Enviar Mais' : 'Enviar Assinada'}
          </button>

          ${a.sub_count > 0 ? `
            <button class="btn-ver" onclick="viewSubs(${a.id})">
              <i class="bi bi-images"></i> ${a.sub_count} enviado${a.sub_count > 1 ? 's' : ''}
            </button>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── UPLOAD ────────────────────────────────────────────────────────
function openUpload(assignmentId, label) {
  selectedFiles = [];
  document.getElementById('uploadAssignmentId').value = assignmentId;
  document.getElementById('uploadLabel').textContent  = label || '';
  document.getElementById('fileInput').value          = '';
  document.getElementById('filePreview').innerHTML    = '';
  document.getElementById('btnSendFiles').disabled    = true;
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
    rm.className = 'remove-file'; rm.textContent = '×';
    rm.onclick = () => { selectedFiles.splice(idx, 1); updatePreview(); };
    thumb.appendChild(rm);
    preview.appendChild(thumb);
  });
  document.getElementById('btnSendFiles').disabled = selectedFiles.length === 0;
}

async function uploadFiles() {
  const assignmentId = document.getElementById('uploadAssignmentId').value;
  if (!selectedFiles.length) return;
  document.getElementById('uploadProgress').style.display = 'block';
  document.getElementById('btnSendFiles').disabled = true;
  const form = new FormData();
  form.append('assignment_id', assignmentId);
  selectedFiles.forEach(f => form.append('files', f));
  try {
    const r = await fetch('/api/submissions', { method: 'POST', body: form });
    const result = await r.json();
    if (result.success) { mUpload.hide(); loadPortal(); }
    else {
      alert('Erro ao enviar: ' + (result.error || 'tente novamente'));
      document.getElementById('uploadProgress').style.display = 'none';
      document.getElementById('btnSendFiles').disabled = false;
    }
  } catch {
    alert('Erro de conexão. Tente novamente.');
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('btnSendFiles').disabled = false;
  }
}

// ── VER ENVIADOS ──────────────────────────────────────────────────
async function viewSubs(assignmentId) {
  const subs = await fetch(`/api/submissions/${assignmentId}`).then(r => r.json());
  const body = document.getElementById('viewSubsBody');
  body.innerHTML = subs.length === 0
    ? '<p class="text-center text-muted py-4">Nenhum arquivo.</p>'
    : `<div class="sub-gallery p-3">${subs.map(s => {
        const isPdf = s.file_path.split('.').pop().toLowerCase() === 'pdf';
        return `<a href="${s.file_path}" target="_blank" class="sub-thumb" title="${s.original_name}">
          ${isPdf ? `<i class="bi bi-file-pdf pdf-icon"></i>` : `<img src="${s.file_path}" loading="lazy">`}
        </a>`;
      }).join('')}</div>`;
  mViewSubs.show();
}

// ── DRAG & DROP ───────────────────────────────────────────────────
const uploadArea = document.getElementById('uploadArea');
const fileInput  = document.getElementById('fileInput');
uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { Array.from(e.target.files).forEach(f => selectedFiles.push(f)); updatePreview(); });
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault(); uploadArea.classList.remove('drag-over');
  Array.from(e.dataTransfer.files).forEach(f => selectedFiles.push(f)); updatePreview();
});

// ── HELPERS ───────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '';
  const [y,m,day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function formatDateTime(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleString('pt-BR');
}

// ── INIT ─────────────────────────────────────────────────────────
if (!teamId || teamId === 'equipe') {
  document.getElementById('content').innerHTML =
    '<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>Link inválido.</p></div>';
} else {
  loadPortal();
}
