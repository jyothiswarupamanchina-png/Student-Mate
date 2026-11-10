/**
 * STUDYPILOT AI — Examination & Personalized Learning Management
 * Uses existing BackendService (JWT auth) and AIService (Gemini).
 * All data is scoped strictly to the authenticated student.
 *
 * API base: http://localhost:8080/api  (requires backend online)
 * Data is NOT silently saved to localStorage when backend is offline.
 */

/* =========================================================================
   0. BOOTSTRAP — wait until app.js has set window.BackendService
   ========================================================================= */
(function initExamLearning() {

  // -------------------------------------------------------------------------
  // 1. UTILITY HELPERS
  // -------------------------------------------------------------------------
  const API = {
    base: () => (localStorage.getItem('studypilot_backend_url') || 'http://localhost:8080/api'),

    headers() {
      const token = window.BackendService?.getToken?.() || '';
      const isValidJwt = token && !token.startsWith('jwt_local_sim_');
      return {
        'Content-Type': 'application/json',
        ...(isValidJwt ? { Authorization: `Bearer ${token}` } : {})
      };
    },

    async get(path) {
      const r = await fetch(this.base() + path, { headers: this.headers() });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const error = new Error(err.message || `GET ${path} → ${r.status}`);
        error.status = r.status;
        throw error;
      }
      return r.json();
    },

    async post(path, body) {
      const r = await fetch(this.base() + path, {
        method: 'POST', headers: this.headers(), body: JSON.stringify(body)
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const error = new Error(err.message || `POST ${path} → ${r.status}`);
        error.status = r.status;
        throw error;
      }
      return r.json();
    },

    async put(path, body) {
      const r = await fetch(this.base() + path, {
        method: 'PUT', headers: this.headers(), body: JSON.stringify(body)
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const error = new Error(err.message || `PUT ${path} → ${r.status}`);
        error.status = r.status;
        throw error;
      }
      return r.json();
    },

    async del(path) {
      const r = await fetch(this.base() + path, { method: 'DELETE', headers: this.headers() });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        // 409 means confirmation required — return the body for caller to handle
        if (r.status === 409) return { ...(err), _status: 409 };
        const error = new Error(err.message || `DELETE ${path} → ${r.status}`);
        error.status = r.status;
        throw error;
      }
      return r.json();
    },

    async delConfirm(path) {
      return this.del(path + '?confirm=true');
    }
  };

  function toast(msg, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${msg}`);
    }
  }

  function el(id) { return document.getElementById(id); }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pct(obtained, max) {
    if (!max || max <= 0) return 0;
    return Math.round((obtained / max) * 1000) / 10;
  }

  function fmtAI(text) {
    if (!text) return '';
    let s = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
    s = s.replace(/```[\s\S]*?```/g, m =>
      `<pre class="el-code-block"><code>${m.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '')}</code></pre>`);
    s = s.replace(/`([^`]+)`/g, '<code class="el-inline-code">$1</code>');
    s = s.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    return s;
  }

  function requireBackend() {
    if (!window.BackendService?.isOnline) {
      throw new Error('The backend server is offline. Please start the Spring Boot application and try again.');
    }
  }

  // -------------------------------------------------------------------------
  // 2. STATE
  // -------------------------------------------------------------------------
  const EL = {
    patterns: [],           // ExamPatternResponse[]
    marks: [],              // SubjectMarkResponse[]
    marksCache: {},         // subjectId → SubjectMarkResponse[]
    threshold: 50,          // performance threshold %
    syllabusCache: {},      // subjectId → SyllabusUnitResponse[]
    currentSyllabusSubjectId: null,
    editingPatternId: null,
    editingMarkId: null,
    editingUnitId: null,
    // temp component rows while editing a pattern
    draftComponents: [],    // { tempId, componentName, maxMarks, displayOrder, isCustom }
    deleteCallback: null,   // function to call when user confirms delete
  };

  // -------------------------------------------------------------------------
  // 3. LOAD SUBJECTS FROM AppState
  // -------------------------------------------------------------------------
  function getSubjects() {
    return window.AppState?.subjects || [];
  }

  // -------------------------------------------------------------------------
  // 4. TAB SWITCHING
  // -------------------------------------------------------------------------
  function initTabs() {
    document.querySelectorAll('.el-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.elTab;
        document.querySelectorAll('.el-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.el-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const pane = el(`elTab-${tab}`);
        if (pane) pane.classList.add('active');
        if (tab === 'marks') loadMarksTab();
        if (tab === 'performance') loadPerformanceTab();
        if (tab === 'syllabus') renderSyllabusTree();
        if (tab === 'ai-learning') populateAiSubjectSelect();
      });
    });
  }

  function renderAuthRequired(containerId, featureName = 'exam patterns') {
    const container = el(containerId);
    if (!container) return;
    container.innerHTML = `<div class="el-empty-state" style="padding: 2.5rem 1.5rem; text-align: center;">
      <i class="fa-solid fa-lock" style="font-size: 2.5rem; color: var(--primary, #3b82f6); margin-bottom: 1rem;"></i>
      <h4 style="margin: 0 0 0.5rem 0; font-size: 1.15rem; color: var(--text-primary, #0f172a);">Student Authentication Required</h4>
      <p style="margin: 0 auto 1.25rem auto; max-width: 440px; color: var(--text-secondary, #64748b); font-size: 0.9rem;">
        Please sign in or register with your student account to access and customize your ${featureName}.
      </p>
      <button type="button" class="btn btn-primary btn-sm el-auth-prompt-btn" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.25rem; font-weight: 500; cursor: pointer;">
        <i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In / Register
      </button>
    </div>`;
    const btn = container.querySelector('.el-auth-prompt-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (typeof window.openAuthModal === 'function') {
          window.openAuthModal('login');
        } else {
          document.getElementById('sidebarAccountBtn')?.click();
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5. EXAM PATTERNS TAB
  // -------------------------------------------------------------------------
  async function loadPatterns() {
    try {
      requireBackend();
      const token = window.BackendService?.getToken?.() || '';
      if (!token || token.startsWith('jwt_local_sim_')) {
        renderAuthRequired('elPatternsList', 'exam patterns');
        return;
      }
      EL.patterns = await API.get('/exam-patterns');
      renderPatternsList();
    } catch (e) {
      if (e.status === 401 || e.status === 403 || (e.message && (e.message.includes('401') || e.message.includes('403')))) {
        renderAuthRequired('elPatternsList', 'exam patterns');
      } else {
        el('elPatternsList').innerHTML = `<div class="el-error-banner"><i class="fa-solid fa-circle-exclamation"></i> ${esc(e.message)}</div>`;
      }
    }
  }

  function renderPatternsList() {
    const container = el('elPatternsList');
    if (!EL.patterns.length) {
      container.innerHTML = `<div class="el-empty-state">
        <i class="fa-solid fa-layer-group"></i>
        <p>No exam patterns yet. Click <strong>Setup Default Pattern</strong> to get started, or create a custom pattern.</p>
      </div>`;
      return;
    }
    container.innerHTML = EL.patterns.map(p => `
      <div class="el-pattern-card${p.default ? ' el-pattern-default' : ''}" data-pattern-id="${p.id}">
        <div class="el-pattern-card-header">
          <span class="el-pattern-name">${esc(p.name)}</span>
          ${p.default ? '<span class="el-badge-default">Default</span>' : ''}
          <div class="el-pattern-actions">
            <button class="btn-icon el-btn-edit-pattern" data-id="${p.id}" title="Edit pattern"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon el-btn-delete-pattern" data-id="${p.id}" title="Delete pattern"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        <div class="el-components-chips">
          ${(p.components || []).map(c => `
            <span class="el-component-chip">
              ${esc(c.componentName)}
              <span class="el-component-marks">${c.maxMarks}</span>
            </span>`).join('')}
          ${!p.components?.length ? '<span class="el-muted">No components added yet</span>' : ''}
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.el-btn-edit-pattern').forEach(btn =>
      btn.addEventListener('click', () => openEditPattern(Number(btn.dataset.id))));
    container.querySelectorAll('.el-btn-delete-pattern').forEach(btn =>
      btn.addEventListener('click', () => confirmDeletePattern(Number(btn.dataset.id))));
  }

  function openCreatePattern() {
    EL.editingPatternId = null;
    EL.draftComponents = [];
    el('elPatternName').value = '';
    el('elPatternIsDefault').checked = false;
    el('elEditPatternId').value = '';
    el('elSavePatternBtn').textContent = 'Save Pattern';
    el('elSavePatternBtn').prepend(Object.assign(document.createElement('i'), { className: 'fa-solid fa-floppy-disk' }));
    renderDraftComponents();
    el('elPatternFormWrap').style.display = '';
    el('elPatternName').focus();
  }

  function openEditPattern(id) {
    const p = EL.patterns.find(x => x.id === id);
    if (!p) return;
    EL.editingPatternId = id;
    EL.draftComponents = (p.components || []).map((c, i) => ({
      tempId: 'ec_' + i,
      id: c.id,
      componentName: c.componentName,
      maxMarks: c.maxMarks,
      displayOrder: c.displayOrder,
      isCustom: c.isCustom
    }));
    el('elPatternName').value = p.name;
    el('elPatternIsDefault').checked = p.default;
    el('elEditPatternId').value = id;
    renderDraftComponents();
    el('elPatternFormWrap').style.display = '';
    el('elPatternName').focus();
  }

  function renderDraftComponents() {
    const list = el('elComponentsList');
    if (!EL.draftComponents.length) {
      list.innerHTML = `<div class="el-muted" style="padding:0.5rem 0;">No components yet. Click <em>Add Component</em> to add assessments (FA1, FA2, CLA, Mid-Sem, etc.).</div>`;
      return;
    }
    list.innerHTML = EL.draftComponents.map((c, i) => `
      <div class="el-component-row" data-temp="${c.tempId}">
        <span class="el-drag-handle">☰</span>
        <input class="form-control el-comp-name" type="text" value="${esc(c.componentName)}" placeholder="e.g. FA1, Mid-Sem, Lab Internal" maxlength="100" data-temp="${c.tempId}">
        <input class="form-control el-comp-max" type="number" value="${c.maxMarks}" min="0" step="0.5" placeholder="Max marks" data-temp="${c.tempId}">
        <button class="btn-icon el-btn-remove-comp" data-temp="${c.tempId}" title="Remove"><i class="fa-solid fa-xmark"></i></button>
      </div>
    `).join('');

    list.querySelectorAll('.el-comp-name').forEach(inp =>
      inp.addEventListener('input', () => {
        const c = EL.draftComponents.find(x => x.tempId === inp.dataset.temp);
        if (c) c.componentName = inp.value;
      }));
    list.querySelectorAll('.el-comp-max').forEach(inp =>
      inp.addEventListener('input', () => {
        const c = EL.draftComponents.find(x => x.tempId === inp.dataset.temp);
        if (c) c.maxMarks = parseFloat(inp.value) || 0;
      }));
    list.querySelectorAll('.el-btn-remove-comp').forEach(btn =>
      btn.addEventListener('click', () => {
        EL.draftComponents = EL.draftComponents.filter(x => x.tempId !== btn.dataset.temp);
        renderDraftComponents();
      }));
  }

  function addDraftComponent() {
    EL.draftComponents.push({
      tempId: 'ec_' + Date.now(),
      id: null,
      componentName: '',
      maxMarks: 20,
      displayOrder: EL.draftComponents.length,
      isCustom: true
    });
    renderDraftComponents();
    // Focus last name input
    const inputs = el('elComponentsList').querySelectorAll('.el-comp-name');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  async function savePattern() {
    const token = window.BackendService?.getToken?.() || '';
    if (!token || token.startsWith('jwt_local_sim_')) {
      toast('Please sign in with your student account to save exam patterns to the server.', 'warning');
      if (typeof window.openAuthModal === 'function') {
        window.openAuthModal('login');
      } else {
        document.getElementById('sidebarAccountBtn')?.click();
      }
      return;
    }

    const name = el('elPatternName').value.trim();
    if (!name) { toast('Please enter a pattern name.', 'warning'); return; }
    if (!EL.draftComponents.length) { toast('Add at least one assessment component.', 'warning'); return; }
    for (const c of EL.draftComponents) {
      if (!c.componentName.trim()) { toast('All components must have a name.', 'warning'); return; }
      if (c.maxMarks <= 0) { toast(`Max marks for "${c.componentName}" must be greater than 0.`, 'warning'); return; }
    }

    try {
      requireBackend();
      const btn = el('elSavePatternBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

      const isDefault = el('elPatternIsDefault').checked;
      const components = EL.draftComponents.map((c, i) => ({
        componentName: c.componentName.trim(),
        maxMarks: c.maxMarks,
        displayOrder: i,
        isCustom: c.isCustom
      }));

      if (!EL.editingPatternId) {
        // Create new
        await API.post('/exam-patterns', { name, isDefault, components });
        toast('Exam pattern created!', 'success');
      } else {
        // Update name/default via PUT, then sync components
        const existing = EL.patterns.find(p => p.id === EL.editingPatternId);
        await API.put(`/exam-patterns/${EL.editingPatternId}`, { name, isDefault });

        // Add or update components
        for (let i = 0; i < components.length; i++) {
          const draft = EL.draftComponents[i];
          if (draft.id) {
            await API.put(`/exam-patterns/${EL.editingPatternId}/components/${draft.id}`,
              { ...components[i] });
          } else {
            await API.post(`/exam-patterns/${EL.editingPatternId}/components`, components[i]);
          }
        }

        // Delete removed components (those in existing but not in draft)
        const draftIds = EL.draftComponents.filter(d => d.id).map(d => d.id);
        for (const ec of (existing?.components || [])) {
          if (!draftIds.includes(ec.id)) {
            const res = await API.del(`/exam-patterns/${EL.editingPatternId}/components/${ec.id}`);
            if (res._status === 409 || res.requiresConfirmation) {
              const proceed = confirm(
                `Component "${ec.componentName}" has ${res.markCount || 'saved'} existing mark record(s).\n\n` +
                `Removing this component from the pattern will keep your historical marks safe, but detach the component link.\n\n` +
                `Do you want to proceed with removing this component?`
              );
              if (proceed) {
                await API.delConfirm(`/exam-patterns/${EL.editingPatternId}/components/${ec.id}`);
              } else {
                toast(`Removal of "${ec.componentName}" was cancelled to protect existing marks.`, 'info');
              }
            }
          }
        }
        toast('Exam pattern updated!', 'success');
      }

      el('elPatternFormWrap').style.display = 'none';
      await loadPatterns();
    } catch (e) {
      toast('Error saving pattern: ' + e.message, 'error');
    } finally {
      const btn = el('elSavePatternBtn');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Pattern'; }
    }
  }

  async function confirmDeletePattern(id) {
    const p = EL.patterns.find(x => x.id === id);
    if (!p) return;
    openDeleteModal(
      `Delete Pattern: ${p.name}`,
      `Deleting this pattern will keep your historical marks safe, but detach the component links. Are you sure you want to delete this pattern?`,
      async () => {
        try {
          requireBackend();
          const res = await API.del(`/exam-patterns/${id}`);
          if (res._status === 409 || res.requiresConfirmation) {
            await API.delConfirm(`/exam-patterns/${id}`);
          }
          toast('Pattern deleted. Historical marks preserved.', 'success');
          await loadPatterns();
        } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
      }
    );
  }

  async function seedDefaultPattern() {
    const token = window.BackendService?.getToken?.() || '';
    if (!token || token.startsWith('jwt_local_sim_')) {
      toast('Please sign in with your student account to set up default patterns.', 'warning');
      if (typeof window.openAuthModal === 'function') {
        window.openAuthModal('login');
      } else {
        document.getElementById('sidebarAccountBtn')?.click();
      }
      return;
    }

    try {
      requireBackend();
      const btn = el('elSeedDefaultPatternBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Setting up…';
      await API.post('/exam-patterns/seed-default', {});
      toast('Default patterns created (Theory Pattern with Mid 1/Mid 2 FA1-FA4 & CLA + Laboratory Pattern)!', 'success');
      await loadPatterns();
    } catch (e) {
      if (e.message.includes('409') || e.message.includes('already')) {
        toast('You already have exam patterns configured.', 'info');
      } else {
        toast('Error: ' + e.message, 'error');
      }
    } finally {
      const btn = el('elSeedDefaultPatternBtn');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-sparkles"></i> Setup Default Pattern'; }
    }
  }

  // -------------------------------------------------------------------------
  // 6. MARKS TAB
  // -------------------------------------------------------------------------
  async function loadMarksTab() {
    populateMarksSubjectFilter();
    populateMarksPatternFilter();
    renderMarksList();
  }

  function populateMarksSubjectFilter() {
    const subjects = getSubjects();
    [el('elMarksSubjectFilter'), el('elMarkSubject')].forEach(sel => {
      if (!sel) return;
      const val = sel.value;
      sel.innerHTML = '<option value="">— Select Subject —</option>' +
        subjects.map(s => `<option value="${esc(s.id)}"${s.id === val ? ' selected' : ''}>${esc(s.title || s.code || s.id)}</option>`).join('');
    });
  }

  function populateMarksPatternFilter() {
    const filterSel = el('elMarksPatternFilter');
    const formSel = el('elMarkPattern');
    const filterVal = filterSel?.value;
    const formVal = formSel?.value;

    if (filterSel) {
      filterSel.innerHTML = '<option value="">— All Patterns —</option>' +
        EL.patterns.map(p => `<option value="${p.id}"${p.id == filterVal ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    }

    if (formSel) {
      formSel.innerHTML = '<option value="">— Select Pattern —</option>' +
        EL.patterns.map(p => `<option value="${p.id}"${p.id == formVal || (!formVal && p.default) ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    }
  }

  function populateMarkComponentSelect(patternId) {
    const sel = el('elMarkComponent');
    if (!sel) return;
    if (!patternId) {
      sel.innerHTML = '<option value="">— Select Pattern First —</option>';
      return;
    }
    const pattern = EL.patterns.find(p => p.id == patternId);
    if (!pattern) { sel.innerHTML = '<option value="">No components</option>'; return; }
    sel.innerHTML = '<option value="">— Select Component —</option>' +
      (pattern.components || []).map(c =>
        `<option value="${c.id}" data-name="${esc(c.componentName)}" data-max="${c.maxMarks}">${esc(c.componentName)} (max ${c.maxMarks})</option>`
      ).join('');
  }

  async function loadMarks(subjectId) {
    if (!subjectId) { EL.marks = []; renderMarksList(); return; }
    try {
      requireBackend();
      const token = window.BackendService?.getToken?.() || '';
      if (!token || token.startsWith('jwt_local_sim_')) {
        renderAuthRequired('elMarksList', 'subject marks');
        return;
      }
      EL.marks = await API.get(`/marks/${encodeURIComponent(subjectId)}`);
      EL.marksCache[subjectId] = EL.marks;
      renderMarksList();
    } catch (e) {
      if (e.status === 401 || e.status === 403 || (e.message && (e.message.includes('401') || e.message.includes('403')))) {
        renderAuthRequired('elMarksList', 'subject marks');
      } else {
        el('elMarksList').innerHTML = `<div class="el-error-banner"><i class="fa-solid fa-circle-exclamation"></i> ${esc(e.message)}</div>`;
      }
    }
  }

  function renderMarksList() {
    const container = el('elMarksList');
    if (!container) return;
    const subjectId = el('elMarksSubjectFilter')?.value;
    const patternId = el('elMarksPatternFilter')?.value;

    let marks = EL.marks;
    if (patternId) {
      const pattern = EL.patterns.find(p => p.id == patternId);
      const compIds = new Set((pattern?.components || []).map(c => String(c.id)));
      marks = marks.filter(m => m.componentId && compIds.has(String(m.componentId)));
    }

    if (!marks.length) {
      container.innerHTML = `<div class="el-empty-state"><i class="fa-solid fa-pen-to-square"></i><p>${subjectId ? 'No marks recorded for this subject yet.' : 'Select a subject to view marks.'}</p></div>`;
      return;
    }

    container.innerHTML = `<div class="el-table-wrap">
      <table class="el-table">
        <thead><tr>
          <th>Component</th><th>Obtained</th><th>Max</th><th>%</th><th>Date</th><th>Notes</th><th></th>
        </tr></thead>
        <tbody>
          ${marks.map(m => {
      const p = pct(m.obtainedMarks, m.maxMarks);
      const cls = p >= EL.threshold ? 'el-pct-good' : 'el-pct-warn';
      return `<tr>
              <td><strong>${esc(m.componentNameSnapshot)}</strong></td>
              <td>${m.obtainedMarks}</td>
              <td>${m.maxMarks}</td>
              <td><span class="el-pct-badge ${cls}">${p}%</span></td>
              <td>${m.examDate || '—'}</td>
              <td class="el-notes-cell">${esc(m.notes || '')}</td>
              <td>
                <button class="btn-icon el-btn-edit-mark" data-id="${m.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon el-btn-delete-mark" data-id="${m.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>`;
    }).join('')}
        </tbody>
      </table>
    </div>`;

    container.querySelectorAll('.el-btn-edit-mark').forEach(btn =>
      btn.addEventListener('click', () => openEditMark(Number(btn.dataset.id))));
    container.querySelectorAll('.el-btn-delete-mark').forEach(btn =>
      btn.addEventListener('click', () => confirmDeleteMark(Number(btn.dataset.id))));
  }

  function openAddMark() {
    EL.editingMarkId = null;
    el('elEditMarkId').value = '';
    el('elMarkObtained').value = '';
    el('elMarkNotes').value = '';
    el('elMarkDate').value = '';
    el('elMarkMax').value = '';

    // Pre-fill subject if filter is active
    const filterSub = el('elMarksSubjectFilter')?.value;
    if (filterSub) el('elMarkSubject').value = filterSub;

    // Refresh pattern options and pre-select pattern
    populateMarksPatternFilter();
    const formPatternSel = el('elMarkPattern');
    const selectedPatternId = formPatternSel?.value || el('elMarksPatternFilter')?.value || (EL.patterns[0]?.id);
    if (formPatternSel && selectedPatternId) {
      formPatternSel.value = selectedPatternId;
    }
    populateMarkComponentSelect(selectedPatternId);

    el('elMarkFormWrap').style.display = '';
    el('elMarkSubject').focus();
  }

  function openEditMark(id) {
    const m = EL.marks.find(x => x.id === id);
    if (!m) return;
    EL.editingMarkId = id;
    el('elEditMarkId').value = id;
    el('elMarkSubject').value = m.subjectId;
    el('elMarkObtained').value = m.obtainedMarks;
    el('elMarkMax').value = m.maxMarks;
    el('elMarkDate').value = m.examDate || '';
    el('elMarkNotes').value = m.notes || '';

    populateMarksPatternFilter();

    // Identify pattern containing this component
    let matchedPatternId = null;
    if (m.componentId) {
      const found = EL.patterns.find(p => (p.components || []).some(c => c.id === m.componentId));
      if (found) matchedPatternId = found.id;
    }
    if (!matchedPatternId) {
      matchedPatternId = el('elMarkPattern')?.value || el('elMarksPatternFilter')?.value || (EL.patterns[0]?.id);
    }

    if (el('elMarkPattern') && matchedPatternId) {
      el('elMarkPattern').value = matchedPatternId;
    }
    if (matchedPatternId) {
      populateMarkComponentSelect(matchedPatternId);
      if (m.componentId) el('elMarkComponent').value = m.componentId;
    }

    el('elMarkFormWrap').style.display = '';
  }

  async function saveMark() {
    const token = window.BackendService?.getToken?.() || '';
    if (!token || token.startsWith('jwt_local_sim_')) {
      toast('Please sign in with your student account to record marks on the server.', 'warning');
      if (typeof window.openAuthModal === 'function') {
        window.openAuthModal('login');
      } else {
        document.getElementById('sidebarAccountBtn')?.click();
      }
      return;
    }

    const subjectId = el('elMarkSubject').value;
    const compSel = el('elMarkComponent');
    const obtained = parseFloat(el('elMarkObtained').value);
    const max = parseFloat(el('elMarkMax').value);
    const date = el('elMarkDate').value;
    const notes = el('elMarkNotes').value.trim();

    if (!subjectId) { toast('Please select a subject.', 'warning'); return; }
    if (isNaN(obtained) || obtained < 0) { toast('Please enter valid obtained marks (≥ 0).', 'warning'); return; }
    if (isNaN(max) || max <= 0) { toast('Please enter valid maximum marks (> 0).', 'warning'); return; }
    if (obtained > max) { toast('Obtained marks cannot exceed maximum marks.', 'warning'); return; }

    let componentId = null;
    let componentNameSnapshot = 'Manual Entry';
    if (compSel.value) {
      componentId = Number(compSel.value);
      const opt = compSel.options[compSel.selectedIndex];
      componentNameSnapshot = opt.dataset.name || opt.text.split(' (')[0];
    }

    const body = {
      subjectId,
      componentId,
      componentNameSnapshot,
      obtainedMarks: obtained,
      maxMarks: max,
      examDate: date || null,
      notes: notes || null
    };

    try {
      requireBackend();
      const btn = el('elSaveMarkBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

      if (!EL.editingMarkId) {
        await API.post(`/marks/${encodeURIComponent(subjectId)}`, body);
        toast('Mark saved!', 'success');
      } else {
        await API.put(`/marks/${encodeURIComponent(subjectId)}/${EL.editingMarkId}`, body);
        toast('Mark updated!', 'success');
      }

      el('elMarkFormWrap').style.display = 'none';
      await loadMarks(subjectId);
    } catch (e) {
      toast('Error saving mark: ' + e.message, 'error');
    } finally {
      const btn = el('elSaveMarkBtn');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Mark'; }
    }
  }

  async function confirmDeleteMark(id) {
    const m = EL.marks.find(x => x.id === id);
    openDeleteModal(
      'Delete Mark Entry',
      `Delete the mark for "${esc(m?.componentNameSnapshot || 'this entry')}"? This cannot be undone.`,
      async () => {
        try {
          requireBackend();
          const subjectId = el('elMarksSubjectFilter').value;
          await API.del(`/marks/${encodeURIComponent(subjectId)}/${id}`);
          toast('Mark deleted.', 'success');
          await loadMarks(subjectId);
        } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
      }
    );
  }

  // -------------------------------------------------------------------------
  // 7. PERFORMANCE TAB
  // -------------------------------------------------------------------------
  async function loadPerformanceTab() {
    // Populate subject filter
    const subjects = getSubjects();
    const sel = el('elPerfSubjectFilter');
    if (sel) {
      const val = sel.value;
      sel.innerHTML = '<option value="">— All Subjects —</option>' +
        subjects.map(s => `<option value="${esc(s.id)}"${s.id === val ? ' selected' : ''}>${esc(s.title || s.code || s.id)}</option>`).join('');
    }

    // Load threshold from backend if online
    const token = window.BackendService?.getToken?.() || '';
    if (!token || token.startsWith('jwt_local_sim_')) {
      const grid = el('elPerformanceGrid');
      if (grid) renderAuthRequired('elPerformanceGrid', 'performance tracking');
      return;
    }

    try {
      requireBackend();
      const settings = await API.get('/settings');
      EL.threshold = settings.performanceThreshold || 50;
      if (el('elThresholdInput')) el('elThresholdInput').value = EL.threshold;
    } catch { /* use default */ }

    await renderPerformanceGrid();
  }

  async function renderPerformanceGrid() {
    const grid = el('elPerformanceGrid');
    if (!grid) return;
    const subjects = getSubjects();
    const filterSubId = el('elPerfSubjectFilter')?.value;
    const targetSubjects = filterSubId
      ? subjects.filter(s => s.id === filterSubId)
      : subjects;

    if (!targetSubjects.length) {
      grid.innerHTML = `<div class="el-empty-state"><i class="fa-solid fa-chart-bar"></i><p>No subjects found. Add subjects from the Dashboard first.</p></div>`;
      return;
    }

    grid.innerHTML = '<div class="el-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading performance data…</div>';

    let html = '';
    for (const subj of targetSubjects) {
      let marks = [];
      try {
        requireBackend();
        marks = await API.get(`/marks/${encodeURIComponent(subj.id)}/performance?threshold=${EL.threshold}`);
      } catch { marks = []; }

      const total = marks.reduce((s, m) => s + m.obtainedMarks, 0);
      const totalMax = marks.reduce((s, m) => s + m.maxMarks, 0);
      const overall = pct(total, totalMax);
      const overallCls = overall >= EL.threshold ? 'el-pct-good' : 'el-pct-warn';

      html += `<div class="el-perf-card">
        <div class="el-perf-card-header">
          <span class="el-perf-subject">${esc(subj.title || subj.code || subj.id)}</span>
          ${marks.length ? `<span class="el-pct-badge ${overallCls}">${overall}% Overall</span>` : '<span class="el-muted">No data</span>'}
        </div>
        ${marks.length ? `
          <div class="el-perf-bars">
            ${marks.map(m => {
        const p2 = pct(m.obtainedMarks, m.maxMarks);
        const cls = m.belowThreshold ? 'el-bar-warn' : 'el-bar-good';
        return `<div class="el-perf-bar-row">
                <span class="el-bar-label">${esc(m.componentNameSnapshot)}</span>
                <div class="el-bar-track">
                  <div class="el-bar-fill ${cls}" style="width:${Math.min(p2, 100)}%"></div>
                </div>
                <span class="el-bar-pct">${p2}%</span>
              </div>
              ${m.belowThreshold ? `<div class="el-feedback-msg"><i class="fa-solid fa-circle-exclamation"></i> ${esc(m.message)}</div>` : ''}`;
      }).join('')}
          </div>` : `<div class="el-muted" style="padding:0.5rem 0;">No marks recorded yet for this subject.</div>`}
      </div>`;
    }
    grid.innerHTML = html;
  }

  async function saveThreshold() {
    const val = parseFloat(el('elThresholdInput')?.value);
    if (isNaN(val) || val < 0 || val > 100) {
      toast('Threshold must be between 0 and 100.', 'warning'); return;
    }
    EL.threshold = val;
    try {
      requireBackend();
      await API.put('/settings', { performanceThreshold: val });
      toast(`Performance threshold set to ${val}%`, 'success');
    } catch (e) {
      toast('Could not save threshold to server: ' + e.message, 'warning');
    }
    await renderPerformanceGrid();
  }

  // -------------------------------------------------------------------------
  // 8. SYLLABUS TAB
  // -------------------------------------------------------------------------
  function populateSyllabusSubjectSelect() {
    const subjects = getSubjects();
    [el('elSyllabusSubjectSelect')].forEach(sel => {
      if (!sel) return;
      const val = sel.value;
      sel.innerHTML = '<option value="">— Select Subject —</option>' +
        subjects.map(s => `<option value="${esc(s.id)}"${s.id === val ? ' selected' : ''}>${esc(s.title || s.code || s.id)}</option>`).join('');
      if (val) sel.value = val;
    });
  }

  async function loadSyllabus(subjectId) {
    if (!subjectId) { renderSyllabusTree(); return; }
    try {
      requireBackend();
      const token = window.BackendService?.getToken?.() || '';
      if (!token || token.startsWith('jwt_local_sim_')) {
        renderAuthRequired('elSyllabusTree', 'syllabus');
        return;
      }
      EL.syllabusCache[subjectId] = await API.get(`/syllabus/${encodeURIComponent(subjectId)}/units`);
      EL.currentSyllabusSubjectId = subjectId;
      renderSyllabusTree();
    } catch (e) {
      if (e.status === 401 || e.status === 403 || (e.message && (e.message.includes('401') || e.message.includes('403')))) {
        renderAuthRequired('elSyllabusTree', 'syllabus');
      } else {
        el('elSyllabusTree').innerHTML = `<div class="el-error-banner"><i class="fa-solid fa-circle-exclamation"></i> ${esc(e.message)}</div>`;
      }
    }
  }

  function renderSyllabusTree() {
    const tree = el('elSyllabusTree');
    if (!tree) return;
    const subjectId = EL.currentSyllabusSubjectId;
    const units = subjectId ? (EL.syllabusCache[subjectId] || []) : [];

    if (!subjectId) {
      tree.innerHTML = `<div class="el-empty-state"><i class="fa-solid fa-book-open"></i><p>Select a subject to manage its syllabus.</p></div>`;
      return;
    }
    if (!units.length) {
      tree.innerHTML = `<div class="el-empty-state"><i class="fa-solid fa-book-open"></i><p>No units yet. Click <strong>Add Unit</strong> to begin.</p></div>`;
      return;
    }

    tree.innerHTML = units.map(u => `
      <div class="el-unit-block" data-unit-id="${u.id}">
        <div class="el-unit-header">
          <span class="el-unit-label">Unit ${u.unitNumber}: ${esc(u.unitTitle)}</span>
          <span class="el-unit-progress">${u.completedTopics}/${u.totalTopics} topics done</span>
          <div class="el-unit-actions">
            <button class="btn-icon el-btn-add-topic" data-unit-id="${u.id}" title="Add topic"><i class="fa-solid fa-plus"></i></button>
            <button class="btn-icon el-btn-edit-unit" data-unit-id="${u.id}" title="Edit unit"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon el-btn-delete-unit" data-unit-id="${u.id}" title="Delete unit"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        ${u.description ? `<div class="el-unit-desc">${esc(u.description)}</div>` : ''}
        <div class="el-topics-list">
          ${(u.topics || []).map(t => `
            <div class="el-topic-row${t.completed ? ' el-topic-done' : ''}" data-topic-id="${t.id}">
              <label class="el-topic-label">
                <input type="checkbox" class="el-topic-check" data-topic-id="${t.id}" data-unit-id="${u.id}" ${t.completed ? 'checked' : ''}> 
                <span>${esc(t.topicTitle)}</span>
              </label>
              <div class="el-topic-actions">
                <button class="btn-icon el-btn-delete-topic" data-topic-id="${t.id}" data-unit-id="${u.id}" title="Remove topic"><i class="fa-solid fa-xmark"></i></button>
              </div>
            </div>`).join('')}
          ${!u.topics?.length ? '<div class="el-muted" style="padding:0.4rem 0 0.4rem 0.5rem;">No topics yet.</div>' : ''}
        </div>
        <!-- Inline add-topic form -->
        <div class="el-add-topic-form" id="elAddTopicForm-${u.id}" style="display:none;">
          <input type="text" class="form-control el-topic-input" id="elTopicInput-${u.id}" placeholder="Topic name…" maxlength="300">
          <button class="btn-primary btn-sm el-btn-save-topic" data-unit-id="${u.id}"><i class="fa-solid fa-floppy-disk"></i> Add</button>
          <button class="btn-secondary btn-sm el-btn-cancel-topic" data-unit-id="${u.id}">Cancel</button>
        </div>
      </div>
    `).join('');

    // Wire events
    tree.querySelectorAll('.el-btn-edit-unit').forEach(btn =>
      btn.addEventListener('click', () => openEditUnit(Number(btn.dataset.unitId))));
    tree.querySelectorAll('.el-btn-delete-unit').forEach(btn =>
      btn.addEventListener('click', () => confirmDeleteUnit(Number(btn.dataset.unitId))));
    tree.querySelectorAll('.el-btn-add-topic').forEach(btn =>
      btn.addEventListener('click', () => {
        const f = el(`elAddTopicForm-${btn.dataset.unitId}`);
        if (f) { f.style.display = ''; el(`elTopicInput-${btn.dataset.unitId}`)?.focus(); }
      }));
    tree.querySelectorAll('.el-btn-save-topic').forEach(btn =>
      btn.addEventListener('click', () => saveTopic(Number(btn.dataset.unitId))));
    tree.querySelectorAll('.el-btn-cancel-topic').forEach(btn =>
      btn.addEventListener('click', () => {
        const f = el(`elAddTopicForm-${btn.dataset.unitId}`);
        if (f) f.style.display = 'none';
      }));
    tree.querySelectorAll('.el-topic-check').forEach(chk =>
      chk.addEventListener('change', () =>
        toggleTopicComplete(Number(chk.dataset.topicId), Number(chk.dataset.unitId), chk.checked)));
    tree.querySelectorAll('.el-btn-delete-topic').forEach(btn =>
      btn.addEventListener('click', () =>
        confirmDeleteTopic(Number(btn.dataset.topicId), Number(btn.dataset.unitId))));
  }

  function openAddUnit() {
    EL.editingUnitId = null;
    el('elEditUnitId').value = '';
    el('elUnitNumber').value = (EL.syllabusCache[EL.currentSyllabusSubjectId]?.length || 0) + 1;
    el('elUnitTitle').value = '';
    el('elUnitDescription').value = '';
    el('elUnitFormWrap').style.display = '';
    el('elUnitTitle').focus();
  }

  function openEditUnit(id) {
    const subjectId = EL.currentSyllabusSubjectId;
    const unit = (EL.syllabusCache[subjectId] || []).find(u => u.id === id);
    if (!unit) return;
    EL.editingUnitId = id;
    el('elEditUnitId').value = id;
    el('elUnitNumber').value = unit.unitNumber;
    el('elUnitTitle').value = unit.unitTitle;
    el('elUnitDescription').value = unit.description || '';
    el('elUnitFormWrap').style.display = '';
    el('elUnitTitle').focus();
  }

  async function saveUnit() {
    const token = window.BackendService?.getToken?.() || '';
    if (!token || token.startsWith('jwt_local_sim_')) {
      toast('Please sign in with your student account to save syllabus units to the server.', 'warning');
      if (typeof window.openAuthModal === 'function') {
        window.openAuthModal('login');
      } else {
        document.getElementById('sidebarAccountBtn')?.click();
      }
      return;
    }

    const subjectId = EL.currentSyllabusSubjectId;
    if (!subjectId) { toast('Please select a subject first.', 'warning'); return; }
    const unitNumber = parseInt(el('elUnitNumber').value, 10);
    const unitTitle = el('elUnitTitle').value.trim();
    const description = el('elUnitDescription').value.trim();
    if (!unitTitle) { toast('Please enter a unit title.', 'warning'); return; }

    try {
      requireBackend();
      const btn = el('elSaveUnitBtn');
      btn.disabled = true;
      if (!EL.editingUnitId) {
        await API.post(`/syllabus/${encodeURIComponent(subjectId)}/units`,
          { unitNumber, unitTitle, description: description || null });
        toast('Unit added!', 'success');
      } else {
        await API.put(`/syllabus/${encodeURIComponent(subjectId)}/units/${EL.editingUnitId}`,
          { unitNumber, unitTitle, description: description || null });
        toast('Unit updated!', 'success');
      }
      el('elUnitFormWrap').style.display = 'none';
      await loadSyllabus(subjectId);
    } catch (e) {
      toast('Error saving unit: ' + e.message, 'error');
    } finally {
      const btn = el('elSaveUnitBtn');
      if (btn) btn.disabled = false;
    }
  }

  async function confirmDeleteUnit(id) {
    openDeleteModal(
      'Delete Unit',
      'Deleting this unit will also delete all its topics. Continue?',
      async () => {
        try {
          requireBackend();
          const subjectId = EL.currentSyllabusSubjectId;
          await API.del(`/syllabus/${encodeURIComponent(subjectId)}/units/${id}`);
          toast('Unit deleted.', 'success');
          await loadSyllabus(subjectId);
        } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
      }
    );
  }

  async function saveTopic(unitId) {
    const subjectId = EL.currentSyllabusSubjectId;
    const title = el(`elTopicInput-${unitId}`)?.value.trim();
    if (!title) { toast('Please enter a topic name.', 'warning'); return; }
    try {
      requireBackend();
      await API.post(`/syllabus/${encodeURIComponent(subjectId)}/units/${unitId}/topics`,
        { topicTitle: title, isCompleted: false });
      toast('Topic added!', 'success');
      await loadSyllabus(subjectId);
    } catch (e) { toast('Error adding topic: ' + e.message, 'error'); }
  }

  async function toggleTopicComplete(topicId, unitId, isCompleted) {
    const subjectId = EL.currentSyllabusSubjectId;
    try {
      requireBackend();
      await API.put(
        `/syllabus/${encodeURIComponent(subjectId)}/units/${unitId}/topics/${topicId}`,
        { isCompleted }
      );
      await loadSyllabus(subjectId);
    } catch (e) {
      toast('Error updating topic: ' + e.message, 'error');
      await loadSyllabus(subjectId); // re-render to restore checkbox state
    }
  }

  async function confirmDeleteTopic(topicId, unitId) {
    openDeleteModal(
      'Remove Topic',
      'Remove this topic from the syllabus?',
      async () => {
        try {
          requireBackend();
          const subjectId = EL.currentSyllabusSubjectId;
          await API.del(`/syllabus/${encodeURIComponent(subjectId)}/units/${unitId}/topics/${topicId}`);
          toast('Topic removed.', 'success');
          await loadSyllabus(subjectId);
        } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
      }
    );
  }

  async function parseSyllabusPdf(file) {
    const subjectId = EL.currentSyllabusSubjectId;
    if (!subjectId) { toast('Please select a subject first.', 'warning'); return; }
    if (!window.AIService?.isConfigured()) {
      toast('Please configure your Gemini API key in AI settings first.', 'warning'); return;
    }

    toast('Reading PDF and extracting syllabus with AI…', 'info');
    try {
      // Read PDF as base64
      const reader = new FileReader();
      const base64 = await new Promise((res, rej) => {
        reader.onload = e => res(e.target.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      const prompt = `Extract all units and topics from this syllabus PDF. Return ONLY valid JSON in this exact format:
[
  {"unitNumber": 1, "unitTitle": "Unit Title Here", "topics": ["Topic 1", "Topic 2", "Topic 3"]},
  {"unitNumber": 2, "unitTitle": "Another Unit", "topics": ["Topic A", "Topic B"]}
]
Do not include any explanation or text outside the JSON array.`;

      const system = 'You are an academic syllabus parser. Extract unit titles and topic names exactly as they appear. Return only the JSON array, no markdown, no extra text.';

      const result = await window.AIService.callAI({
        prompt,
        systemInstruction: system,
        attachments: [{ base64Data: base64, mimeType: 'application/pdf', name: file.name }]
      });

      let parsed;
      try {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result);
      } catch {
        throw new Error('Could not parse AI response as JSON. Try a clearer PDF.');
      }

      if (!Array.isArray(parsed) || !parsed.length) throw new Error('No units extracted from PDF.');

      requireBackend();
      await API.post(`/syllabus/${encodeURIComponent(subjectId)}/upload-pdf`, { units: parsed });
      toast(`Successfully imported ${parsed.length} units from PDF!`, 'success');
      await loadSyllabus(subjectId);
    } catch (e) {
      toast('PDF parse error: ' + e.message, 'error');
    }
  }

  // -------------------------------------------------------------------------
  // 9. AI LEARNING TAB
  // -------------------------------------------------------------------------
  const AI_SYSTEM = `You are StudyPilot AI, an expert academic learning assistant. 
You help students understand their course material through clear explanations, structured notes, practice questions, and revision plans.
IMPORTANT RULES:
- Do NOT suggest YouTube videos, online tutorials, external courses, websites, apps, or any external learning resources.
- Provide ONLY self-contained academic content.
- Keep all explanations clear, structured, and suitable for university-level students.
- Use headings, bullet points, and examples where appropriate.
- Do NOT infer or diagnose weak topics without explicit topic-level assessment evidence. Base recommendations on syllabus coverage status, pending uncompleted topics, and core university exam weightage.`;

  function populateAiSubjectSelect() {
    const subjects = getSubjects();
    const sel = el('elAiSubjectSelect');
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="">— Select Subject —</option>' +
      subjects.map(s => `<option value="${esc(s.id)}" data-title="${esc(s.title || s.code || s.id)}"${s.id === val ? ' selected' : ''}>${esc(s.title || s.code || s.id)}</option>`).join('');
  }

  function getSelectedSubjectTitle() {
    const sel = el('elAiSubjectSelect');
    if (!sel || !sel.value) return '';
    return sel.options[sel.selectedIndex]?.dataset.title || sel.options[sel.selectedIndex]?.text || '';
  }

  function getSubjectSyllabusSummary(subjectId) {
    const units = EL.syllabusCache[subjectId] || [];
    if (!units.length) return 'No syllabus data available.';
    return units.map(u =>
      `Unit ${u.unitNumber}: ${u.unitTitle}\n` +
      (u.topics || []).map(t => `  - ${t.topicTitle}${t.completed ? ' ✓' : ''}`).join('\n')
    ).join('\n\n');
  }

  async function runAiAction(action) {
    if (!window.AIService?.isConfigured()) {
      toast('Please configure your Gemini API key first (AI Engine button in header).', 'warning'); return;
    }

    const subjectId = el('elAiSubjectSelect')?.value;
    const subjectTitle = getSelectedSubjectTitle();
    const topicInput = el('elAiTopicInput')?.value.trim();
    const difficulty = el('elAiDifficulty')?.value || 'medium';
    const examDate = el('elAiExamDate')?.value;

    if (!subjectId && action !== 'recommend') {
      toast('Please select a subject.', 'warning'); return;
    }
    if (!topicInput && ['explain', 'notes', 'questions', 'quiz'].includes(action)) {
      toast('Please enter a topic name.', 'warning'); return;
    }

    // Ensure syllabus is loaded in cache for this subject if online
    if (subjectId && !EL.syllabusCache[subjectId] && window.BackendService?.isOnline) {
      try {
        EL.syllabusCache[subjectId] = await API.get(`/syllabus/${encodeURIComponent(subjectId)}/units`);
      } catch { /* ignore */ }
    }

    const syllabus = getSubjectSyllabusSummary(subjectId);
    let prompt = '';
    let responseLabel = '';

    switch (action) {
      case 'recommend': {
        let perfNote = '';
        let marksForSub = EL.marksCache[subjectId] || [];
        if (!marksForSub.length && subjectId && window.BackendService?.isOnline) {
          try {
            marksForSub = await API.get(`/marks/${encodeURIComponent(subjectId)}`);
            EL.marksCache[subjectId] = marksForSub;
          } catch { /* ignore */ }
        }
        if (marksForSub.length > 0) {
          const compMarks = marksForSub.map(m => {
            const p = m.percentage != null ? Number(m.percentage).toFixed(1) : pct(m.obtainedMarks, m.maxMarks);
            return `- ${m.componentNameSnapshot || 'Assessment'}: ${m.obtainedMarks}/${m.maxMarks} (${p}%)`;
          }).join('\n');
          perfNote = `\nCurrent Assessment Marks for this subject:\n${compMarks}\n`;
        }
        prompt = `A student is studying ${subjectTitle || 'their subjects'}.
Syllabus structure and completion status (✓ = completed):
${syllabus}
${perfNote}
Based on pending syllabus coverage (topics not yet marked completed) and core exam topics, recommend 5-7 key topics the student should prioritize for revision. Explain why each is important.
IMPORTANT:
- Do NOT infer or guess weak topics without specific topic-level evidence.
- Base your recommendations on pending/incomplete syllabus topics and high-weightage concepts typical in university exams.
- Do NOT recommend YouTube videos, external tutorials, or websites. Provide direct, self-contained study advice.`;
        responseLabel = `📌 Recommended Topics — ${subjectTitle}`;
        break;
      }

      case 'explain':
        prompt = `Explain the topic "${topicInput}" from the subject "${subjectTitle}".
Include: key definitions, core concepts, underlying principles, and 2-3 concrete examples. Use clear academic language suitable for university students.`;
        responseLabel = `💡 Explanation: ${topicInput}`;
        break;

      case 'notes':
        prompt = `Create comprehensive revision notes for the topic "${topicInput}" in the subject "${subjectTitle}".
Structure using:
1. Overview / Introduction
2. Key Concepts & Definitions
3. Important Formulas or Rules (if applicable)
4. Step-by-Step Examples
5. Quick Summary / Key Takeaways`;
        responseLabel = `📝 Notes: ${topicInput}`;
        break;

      case 'summary':
        prompt = `Summarize the topic/unit "${topicInput || 'this unit'}" from the subject "${subjectTitle}".
Syllabus reference:
${syllabus}
Write a concise academic summary covering the main themes, key ideas, and their relationships. Suitable for exam revision.`;
        responseLabel = `📋 Summary: ${topicInput || subjectTitle}`;
        break;

      case 'questions':
        prompt = `Generate 5 ${difficulty}-difficulty practice questions on the topic "${topicInput}" for the subject "${subjectTitle}".
For each question:
- State the question clearly
- Provide a complete model answer
- Include any relevant formulas or working where applicable`;
        responseLabel = `❓ Practice Questions: ${topicInput}`;
        break;

      case 'quiz':
        prompt = `Generate a 10-question multiple-choice quiz on the topic "${topicInput}" for the subject "${subjectTitle}" at ${difficulty} difficulty.
Format each question as:
Q1. [Question]
A) [Option]  B) [Option]  C) [Option]  D) [Option]
Answer: [Correct option letter]
Explanation: [Brief explanation]`;
        responseLabel = `⚡ Quiz: ${topicInput}`;
        break;

      case 'revision':
        const days = examDate
          ? Math.max(1, Math.ceil((new Date(examDate) - new Date()) / 86400000))
          : 14;
        prompt = `Create a ${days}-day revision plan for the subject "${subjectTitle}"${examDate ? ` with the exam on ${examDate}` : ''}.
Syllabus:
${syllabus}
Allocate study sessions across all units and topics. Suggest which topics to cover each day, estimated time per session, and what type of practice to do (reading, problems, revision, mock test). Be realistic and achievable.`;
        responseLabel = `📅 ${days}-Day Revision Plan: ${subjectTitle}`;
        break;
    }

    // Show loading
    el('elAiResponseWrap').style.display = 'none';
    el('elAiLoadingWrap').style.display = '';

    try {
      const result = await window.AIService.callAI({
        prompt,
        systemInstruction: AI_SYSTEM,
        temperature: 0.65
      });

      el('elAiResponseLabel').innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> ${responseLabel}`;
      el('elAiResponseContent').innerHTML = fmtAI(result);
      el('elAiResponseWrap').style.display = '';
    } catch (e) {
      toast('AI error: ' + (e.message === 'API_KEY_REQUIRED'
        ? 'Please configure your Gemini API key.'
        : e.message), 'error');
    } finally {
      el('elAiLoadingWrap').style.display = 'none';
    }
  }

  // -------------------------------------------------------------------------
  // 10. DELETE CONFIRMATION MODAL
  // -------------------------------------------------------------------------
  function openDeleteModal(title, msg, onConfirm) {
    el('elDeleteModalTitle').textContent = title;
    el('elDeleteModalMsg').textContent = msg;
    EL.deleteCallback = onConfirm;
    el('elDeleteConfirmModal').style.display = '';
  }

  function closeDeleteModal() {
    el('elDeleteConfirmModal').style.display = 'none';
    EL.deleteCallback = null;
  }

  // -------------------------------------------------------------------------
  // 11. WIRE ALL EVENT LISTENERS
  // -------------------------------------------------------------------------
  function wireEvents() {
    // Tabs
    initTabs();

    // Seed default pattern
    el('elSeedDefaultPatternBtn')?.addEventListener('click', seedDefaultPattern);

    // Pattern form
    el('elCreatePatternBtn')?.addEventListener('click', openCreatePattern);
    el('elAddComponentBtn')?.addEventListener('click', addDraftComponent);
    el('elSavePatternBtn')?.addEventListener('click', savePattern);
    el('elCancelPatternBtn')?.addEventListener('click', () => {
      el('elPatternFormWrap').style.display = 'none';
    });

    // Marks form
    el('elAddMarkBtn')?.addEventListener('click', openAddMark);
    el('elSaveMarkBtn')?.addEventListener('click', saveMark);
    el('elCancelMarkBtn')?.addEventListener('click', () => {
      el('elMarkFormWrap').style.display = 'none';
    });

    // Filter marks by subject
    el('elMarksSubjectFilter')?.addEventListener('change', (e) => {
      el('elMarkSubject').value = e.target.value;
      loadMarks(e.target.value);
    });

    // Filter marks by pattern → populate component select
    el('elMarksPatternFilter')?.addEventListener('change', (e) => {
      populateMarkComponentSelect(e.target.value);
    });

    // When pattern changes in mark entry form
    el('elMarkPattern')?.addEventListener('change', (e) => {
      populateMarkComponentSelect(e.target.value);
    });

    // Auto-fill max marks from component selection
    el('elMarkComponent')?.addEventListener('change', (e) => {
      const opt = e.target.options[e.target.selectedIndex];
      if (opt && opt.dataset.max) {
        el('elMarkMax').value = opt.dataset.max;
      }
    });

    // Performance threshold
    el('elSaveThresholdBtn')?.addEventListener('click', saveThreshold);
    el('elPerfSubjectFilter')?.addEventListener('change', renderPerformanceGrid);

    // Syllabus
    el('elSyllabusSubjectSelect')?.addEventListener('change', (e) => {
      EL.currentSyllabusSubjectId = e.target.value || null;
      loadSyllabus(e.target.value);
    });
    el('elAddUnitBtn')?.addEventListener('click', () => {
      if (!EL.currentSyllabusSubjectId) { toast('Please select a subject first.', 'warning'); return; }
      openAddUnit();
    });
    el('elSaveUnitBtn')?.addEventListener('click', saveUnit);
    el('elCancelUnitBtn')?.addEventListener('click', () => {
      el('elUnitFormWrap').style.display = 'none';
    });
    el('elUploadSyllabusPdfBtn')?.addEventListener('click', () => {
      if (!EL.currentSyllabusSubjectId) { toast('Please select a subject first.', 'warning'); return; }
      el('elSyllabusPdfInput')?.click();
    });
    el('elSyllabusPdfInput')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) parseSyllabusPdf(file);
      e.target.value = '';
    });

    // AI learning actions
    document.querySelectorAll('.el-ai-action-btn').forEach(btn => {
      btn.addEventListener('click', () => runAiAction(btn.dataset.aiAction));
    });
    el('elAiClearBtn')?.addEventListener('click', () => {
      el('elAiResponseWrap').style.display = 'none';
      el('elAiResponseContent').innerHTML = '';
    });

    // Delete modal
    el('elDeleteConfirmBtn')?.addEventListener('click', async () => {
      if (EL.deleteCallback) await EL.deleteCallback();
      closeDeleteModal();
    });
    el('elDeleteCancelBtn')?.addEventListener('click', closeDeleteModal);
    el('elDeleteConfirmModal')?.addEventListener('click', (e) => {
      if (e.target === el('elDeleteConfirmModal')) closeDeleteModal();
    });
  }

  // -------------------------------------------------------------------------
  // 12. REFRESH SUBJECT DROPDOWNS whenever subjects change
  // -------------------------------------------------------------------------
  function refreshSubjectDropdowns() {
    populateMarksSubjectFilter();
    populateMarksPatternFilter();
    populateSyllabusSubjectSelect();
    populateAiSubjectSelect();
  }

  // -------------------------------------------------------------------------
  // 13. INITIALIZE when section becomes visible
  // -------------------------------------------------------------------------
  async function initExamSection() {
    wireEvents();
    populateSyllabusSubjectSelect();
    populateAiSubjectSelect();

    // Load patterns if backend is online
    if (window.BackendService?.isOnline) {
      await loadPatterns();
      await loadPerformanceTab();
    } else {
      el('elPatternsList').innerHTML = `<div class="el-error-banner">
        <i class="fa-solid fa-server"></i> Backend is offline. Start the Spring Boot application to manage exam patterns, marks, and syllabus.
      </div>`;
    }
  }

  // -------------------------------------------------------------------------
  // 14. HOOK INTO NAVIGATION — load on first visit
  // -------------------------------------------------------------------------
  let initialized = false;

  async function onSectionActivated() {
    if (window.BackendService) {
      await window.BackendService.checkBackendStatus();
    }
    if (!initialized) {
      initialized = true;
      await initExamSection();
    } else {
      refreshSubjectDropdowns();
      if (window.BackendService?.isOnline) {
        await loadPatterns();
        await loadPerformanceTab();
      }
    }
  }

  // Watch for the exam-learning section becoming active
  const sectionEl = document.getElementById('section-exam-learning');
  if (sectionEl) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'class' && sectionEl.classList.contains('active')) {
          onSectionActivated();
        }
      }
    });
    observer.observe(sectionEl, { attributes: true });
    if (sectionEl.classList.contains('active')) {
      onSectionActivated();
    }
  }

  // Expose for external use
  window.ExamLearningService = {
    reload: () => { initialized = false; onSectionActivated(); },
    refreshSubjects: refreshSubjectDropdowns,
  };

})();

