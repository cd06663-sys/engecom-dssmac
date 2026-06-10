const teamId = window.location.pathname.split('/').pop();
let selectedFiles = [];

const mUpload   = new bootstrap.Modal('#modalUpload');
const mViewSubs = new bootstrap.Modal('#modalViewSubs');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function safeUrl(value) {
  const url = String(value || '');
  return /^(https?:)?\/\//i.test(url) || url.startsWith('/') ? esc(url) : '#';
}

// ── INDEXEDDB UPLOAD QUEUE ────────────────────────────────────────
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('dssmac_queue', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('queue', { autoIncrement: true, keyPath: 'id' });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

async function queueAdd(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').add(item).onsuccess = e => resolve(e.target.result);
    tx.onerror = () => reject(tx.error);
  });
}

async function queueGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readonly');
    tx.objectStore('queue').getAll().onsuccess = e => resolve(e.target.result);
    tx.onerror = () => reject(tx.error);
  });
}

async function queueDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').delete(id).onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function fileToBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, type: file.type, data: r.result });
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

// ── OFFLINE BANNER ────────────────────────────────────────────────
async function updateOfflineBanner() {
  const items = await queueGetAll().catch(() => []);
  const banner = document.getElementById('offlineBanner');
  if (!banner) return;
  const count = items.filter(i => !i.teamId || i.teamId === teamId).length;

  if (!navigator.onLine) {
    banner.style.display = '';
    banner.className = 'offline-banner offline';
    banner.innerHTML = `<i class="bi bi-wifi-off"></i>&nbsp; Sem conexão${count > 0 ? ` — ${count} lista(s) aguardando envio` : ' — modo offline'}`;
  } else if (count > 0) {
    banner.style.display = '';
    banner.className = 'offline-banner syncing';
    banner.innerHTML = `<i class="bi bi-arrow-repeat spin"></i>&nbsp; ${count} lista(s) na fila — enviando...`;
  } else {
    banner.style.display = 'none';
  }
}

// ── TOAST ─────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const colors = { success: '#198754', warning: '#e67e22', error: '#dc3545', info: '#1a3a6b' };
  const el = document.createElement('div');
  el.className = 'dssmac-toast';
  el.style.background = colors[type] || colors.info;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3500);
}

// ── SINCRONIZAR FILA ──────────────────────────────────────────────
let _syncing = false;

async function syncQueue() {
  if (_syncing || !navigator.onLine) return;
  const items = await queueGetAll().catch(() => []);
  if (!items.length) return;

  _syncing = true;
  updateOfflineBanner();

  let sent = 0;
  for (const item of items) {
    if (!navigator.onLine) break;
    try {
      const form = new FormData();
      form.append('assignment_id', item.assignmentId);
      form.append('team_id', item.teamId || teamId);
      item.files.forEach(f => {
        form.append('files', new Blob([f.data], { type: f.type }), f.name);
      });
      const r = await fetch('/api/submissions', { method: 'POST', body: form });
      const result = await r.json();
      if (result.success) { await queueDelete(item.id); sent++; }
    } catch { break; }
  }

  _syncing = false;
  if (sent > 0) {
    showToast(`${sent} lista(s) enviada(s) com sucesso!`, 'success');
    loadPortal();
  }
  updateOfflineBanner();
}

// ── CARREGAR PORTAL ───────────────────────────────────────────────
async function loadPortal() {
  try {
    const data = await fetch(`/api/portal/${teamId}`).then(r => r.json());
    if (data.error) {
      document.getElementById('content').innerHTML =
        `<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>Link inválido. Verifique o endereço.</p></div>`;
      return;
    }
    try { localStorage.setItem(`portal_${teamId}`, JSON.stringify(data)); } catch {}
    document.getElementById('teamTitle').textContent    = data.team.name;
    document.getElementById('teamDistrict').textContent = data.team.district_city || data.team.district_name || '';
    document.title = `${data.team.name || 'Equipe'} — ENGECOM`;
    renderListas(data.assignments);
  } catch {
    const cached = localStorage.getItem(`portal_${teamId}`);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        document.getElementById('teamTitle').textContent    = data.team.name;
        document.getElementById('teamDistrict').textContent = data.team.district_city || data.team.district_name || '';
        document.title = `${data.team.name || 'Equipe'} — ENGECOM`;
        renderListas(data.assignments);
        return;
      } catch {}
    }
    document.getElementById('content').innerHTML =
      `<div class="empty-state"><i class="bi bi-wifi-off"></i>
       <p style="font-size:16px;font-weight:600;">Sem conexão</p>
       <p style="font-size:13px;">Abra o app quando tiver internet para carregar os dados.</p></div>`;
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
    const status      = isSubmitted ? 'submitted' : 'pending';
    const title       = a.title || 'Treinamento';
    const info        = [
      a.date ? formatDate(a.date) : null,
      (a.time_start && a.time_end) ? `${a.time_start} – ${a.time_end}` : null,
      a.instructor_name ? `Instrutor: ${a.instructor_name}` : null,
    ].filter(Boolean).join('  •  ');

    return `
      <div class="lista-card status-${status}" id="card_${a.id}">
        <div class="lista-card-body">
          <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
            <div style="flex:1;">
              <div class="lista-num">Lista ${num}</div>
              <div class="lista-title">${esc(title)}</div>
              ${info ? `<div class="lista-info">${esc(info)}</div>` : ''}
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
                  data-label="${esc(`${title} — Lista ${num}`)}"
                  onclick="openUpload(${a.id}, this.dataset.label)">
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
  const prog = document.getElementById('uploadProgress');
  prog.style.display = 'none';
  prog.innerHTML = `
    <div class="progress">
      <div class="progress-bar progress-bar-striped progress-bar-animated" style="width:100%"></div>
    </div>
    <p class="text-center small mt-1 text-muted">Enviando...</p>`;
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
      thumb.innerHTML = `<div><i class="bi bi-file-pdf" style="font-size:28px;color:#c0392b;"></i><br><small>${esc(file.name)}</small></div>`;
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
  const label = document.getElementById('uploadLabel').textContent;
  if (!selectedFiles.length) return;

  const prog = document.getElementById('uploadProgress');
  prog.style.display = 'block';
  document.getElementById('btnSendFiles').disabled = true;

  // Offline — queue for later
  if (!navigator.onLine) {
    prog.innerHTML = `<p class="text-center small mt-1" style="color:#e67e22"><i class="bi bi-clock me-1"></i>Sem conexão — salvando para envio posterior...</p>`;
    try {
      const buffers = await Promise.all(selectedFiles.map(fileToBuffer));
      await queueAdd({ teamId, assignmentId, label, files: buffers, timestamp: Date.now() });
      mUpload.hide();
      updateOfflineBanner();
      showToast('Lista salva! Será enviada automaticamente quando tiver conexão.', 'warning');
    } catch (err) {
      alert('Erro ao salvar: ' + (err.message || 'tente novamente'));
      prog.style.display = 'none';
      document.getElementById('btnSendFiles').disabled = false;
    }
    return;
  }

  // Online upload
  const form = new FormData();
  form.append('assignment_id', assignmentId);
  form.append('team_id', teamId);
  selectedFiles.forEach(f => form.append('files', f));
  try {
    const r = await fetch('/api/submissions', { method: 'POST', body: form });
    const result = await r.json();
    if (result.success) { mUpload.hide(); loadPortal(); }
    else {
      alert('Erro ao enviar: ' + (result.error || 'tente novamente'));
      prog.style.display = 'none';
      document.getElementById('btnSendFiles').disabled = false;
    }
  } catch {
    // Connection dropped mid-upload — save to queue
    try {
      const buffers = await Promise.all(selectedFiles.map(fileToBuffer));
      await queueAdd({ teamId, assignmentId, label, files: buffers, timestamp: Date.now() });
      mUpload.hide();
      updateOfflineBanner();
      showToast('Conexão perdida — lista salva para envio posterior.', 'warning');
    } catch {
      alert('Erro de conexão. Tente novamente.');
      prog.style.display = 'none';
      document.getElementById('btnSendFiles').disabled = false;
    }
  }
}

// ── VER ENVIADOS ──────────────────────────────────────────────────
async function viewSubs(assignmentId) {
  const subs = await fetch(`/api/portal/${teamId}/submissions/${assignmentId}`).then(r => r.json());
  if (!Array.isArray(subs)) {
    alert(subs.error || 'Erro ao carregar documentos.');
    return;
  }
  const body = document.getElementById('viewSubsBody');
  body.innerHTML = subs.length === 0
    ? '<p class="text-center text-muted py-4">Nenhum arquivo.</p>'
    : `<div class="sub-gallery p-3">${subs.map(s => {
        const isPdf = s.file_path.split('.').pop().toLowerCase() === 'pdf';
        return `<a href="${safeUrl(s.file_path)}" target="_blank" rel="noopener" class="sub-thumb" title="${esc(s.original_name)}">
          ${isPdf ? `<i class="bi bi-file-pdf pdf-icon"></i>` : `<img src="${safeUrl(s.file_path)}" loading="lazy">`}
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
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// ── EVENTOS ONLINE/OFFLINE ────────────────────────────────────────
window.addEventListener('online',  () => { updateOfflineBanner(); syncQueue(); });
window.addEventListener('offline', () => updateOfflineBanner());

// ── SERVICE WORKER ────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── INIT ─────────────────────────────────────────────────────────
if (!teamId || teamId === 'equipe') {
  document.getElementById('content').innerHTML =
    '<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>Link inválido.</p></div>';
} else {
  loadPortal();
  updateOfflineBanner();
  if (navigator.onLine) syncQueue();
}
