/* Tajneed Renewal - works offline from file://, no server needed.
 *
 * Data lives in localStorage so the Edit tab and the View tab (same browser)
 * share it. The View tab listens for `storage` events to update live.
 */
(function () {
  'use strict';

  const KEY_DATA = 'tajneed:data';
  const KEY_CURRENT = 'tajneed:current';
  const KEY_EDITOR = 'tajneed:editor';
  const MAX_RESULTS = 300;

  // Known columns. Anything else in the file still shows up, under "Other".
  const FIELDS = {
    aims_id: { label: 'AIMS ID', section: 'Personal' },
    full_name: { label: 'Full name', section: 'Personal' },
    father_or_husband_name: { label: "Father's / husband's name", section: 'Personal' },
    gender: { label: 'Gender', section: 'Personal', options: ['Male', 'Female'] },
    date_of_birth: { label: 'Date of birth', section: 'Personal', type: 'date' },
    marital_status: { label: 'Marital status', section: 'Personal', options: ['Single', 'Married', 'Divorced', 'Widowed'] },
    phone: { label: 'Phone', section: 'Contact', type: 'tel' },
    email: { label: 'Email', section: 'Contact', type: 'email' },
    address: { label: 'Address', section: 'Contact', wide: true, textarea: true },
    postcode: { label: 'Postcode', section: 'Contact' },
    auxiliary: { label: 'Auxiliary', section: 'Jamaat', options: ['Atfal', 'Khuddam', 'Ansar', 'Nasirat', 'Lajna'] },
    majlis: { label: 'Majlis / Jamaat', section: 'Jamaat', suggest: true },
    region: { label: 'Region', section: 'Jamaat', suggest: true },
    family_id: { label: 'Family ID', section: 'Family' },
    head_of_household: { label: 'Head of household', section: 'Family', options: ['Yes', 'No'] },
    relationship_to_head: { label: 'Relationship to head', section: 'Family', suggest: true },
    last_verified_date: { label: 'Last verified', section: 'Record', type: 'date' },
    verified_by: { label: 'Verified by', section: 'Record', hideInView: true },
    notes: { label: 'Notes (not shown to member)', section: 'Record', wide: true, textarea: true, hideInView: true },
  };
  const SECTIONS = ['Personal', 'Contact', 'Jamaat', 'Family', 'Record', 'Other'];

  // Header names accepted for the two required columns.
  const ID_KEYS = ['aims_id', 'aims', 'aims_no', 'aims_number', 'member_id', 'id'];
  const NAME_KEYS = ['full_name', 'name', 'member_name'];

  const $ = (id) => document.getElementById(id);

  // ---------- storage ----------

  function loadData() {
    try {
      const raw = localStorage.getItem(KEY_DATA);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveData(data) {
    try {
      localStorage.setItem(KEY_DATA, JSON.stringify(data));
      return true;
    } catch (e) {
      alert('Could not save in the browser (storage full or blocked). Export your data now.\n\n' + e.message);
      return false;
    }
  }

  function getCurrent() {
    try {
      const raw = localStorage.getItem(KEY_CURRENT);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setCurrent(id) {
    try {
      if (id == null) localStorage.removeItem(KEY_CURRENT);
      else localStorage.setItem(KEY_CURRENT, JSON.stringify({ id: id, ts: Date.now() }));
    } catch (e) { /* view tab just won't follow */ }
  }

  // The file handle (Chrome/Edge) is kept in IndexedDB so "save back to file"
  // survives a page reload. localStorage cannot hold it.
  const handleStore = {
    open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('tajneed', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('handles');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async get() {
      try {
        const db = await this.open();
        return await new Promise((resolve) => {
          const req = db.transaction('handles').objectStore('handles').get('file');
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
      } catch (e) {
        return null;
      }
    },
    async set(handle) {
      try {
        const db = await this.open();
        const tx = db.transaction('handles', 'readwrite');
        if (handle) tx.objectStore('handles').put(handle, 'file');
        else tx.objectStore('handles').delete('file');
      } catch (e) { /* not fatal */ }
    },
  };

  // ---------- file reading / writing ----------

  function keyFromHeader(h) {
    return String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => v.trim() !== ''));
  }

  function toCsv(columns, rows) {
    const esc = (v) => {
      v = v == null ? '' : String(v);
      return /[",\r\n]|^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const lines = [columns.map((c) => esc(c.header)).join(',')];
    rows.forEach((r) => lines.push(columns.map((c) => esc(r[c.key])).join(',')));
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  function toXlsx(columns, rows) {
    const aoa = [columns.map((c) => c.header)];
    rows.forEach((r) => aoa.push(columns.map((c) => (r[c.key] == null ? '' : String(r[c.key])))));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Store every cell as text so phone numbers keep their leading 0
    Object.keys(ws).forEach((k) => { if (k[0] !== '!') { ws[k].t = 's'; ws[k].z = '@'; } });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tajneed');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  }

  async function readTable(file) {
    const isCsv = /\.csv$/i.test(file.name);
    let table;
    let sheetCount = 1;
    if (isCsv) {
      table = parseCsv(await file.text());
    } else {
      if (typeof XLSX === 'undefined') throw new Error('Excel support missing (vendor/xlsx.mini.min.js not found).');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      sheetCount = wb.SheetNames.length;
      const ws = wb.Sheets[wb.SheetNames[0]];
      table = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd', blankrows: false })
        .map((r) => r.map((v) => String(v)));
    }
    if (table.length < 1) throw new Error('The file is empty.');

    const used = {};
    const columns = table[0].map((h, i) => {
      let key = keyFromHeader(h) || 'column_' + (i + 1);
      while (used[key]) key += '_';
      used[key] = true;
      return { key: key, header: String(h).trim() || key };
    });
    const idKey = ID_KEYS.find((k) => used[k]);
    const nameKey = NAME_KEYS.find((k) => used[k]);
    if (!idKey || !nameKey) {
      throw new Error('Could not find the AIMS ID and name columns. Expected headers like "aims_id" and "full_name".');
    }
    const rows = table.slice(1).map((r) => {
      const obj = {};
      columns.forEach((c, i) => { obj[c.key] = (r[i] == null ? '' : String(r[i])).trim(); });
      return obj;
    });
    return {
      fileName: file.name,
      fileType: isCsv ? 'csv' : 'xlsx',
      sheetCount: sheetCount,
      idKey: idKey,
      nameKey: nameKey,
      columns: columns,
      rows: rows,
      changed: [],
      unexported: false,
      loadedAt: new Date().toISOString(),
    };
  }

  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- search ----------

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Optimal string alignment distance (Levenshtein + adjacent swaps)
  function editDistance(a, b) {
    const m = a.length;
    const n = b.length;
    const d = [];
    for (let i = 0; i <= m; i++) { d[i] = [i]; }
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[m][n];
  }

  // How well a typed word matches a word in the name (0..1)
  function wordSimilarity(q, w) {
    if (q === w) return 1;
    if (w.startsWith(q)) return 0.95;
    if (q.length <= 2) return 0;
    let best = 1 - editDistance(q, w) / Math.max(q.length, w.length);
    // Half-typed word with a typo, e.g. "muha" for "mohammad"
    if (w.length > q.length) {
      const p = (1 - editDistance(q, w.slice(0, q.length)) / q.length) * 0.9;
      if (p > best) best = p;
    }
    return best;
  }

  // Higher score = better match. 0 = no match.
  function scoreMember(entry, q, qWords) {
    const digits = q.replace(/\s/g, '');
    if (/^\d+$/.test(digits)) {
      if (entry.id === digits) return 1000;
      if (entry.id.startsWith(digits)) return 900;
      if (entry.id.includes(digits)) return 800;
      return 0;
    }
    const name = entry.name;
    if (name === q) return 1000;
    if (name.startsWith(q)) return 950;
    if (entry.sortedWords === qWords.slice().sort().join(' ')) return 900; // same words, any order
    if (qWords.every((w) => entry.words.includes(w))) return 850;
    if (qWords.every((w) => entry.words.some((nw) => nw.startsWith(w)))) return 800;
    if (name.includes(q)) return 750;

    let total = 0;
    let worst = 1;
    for (const qw of qWords) {
      let best = 0;
      for (const nw of entry.words) best = Math.max(best, wordSimilarity(qw, nw));
      total += best;
      worst = Math.min(worst, best);
    }
    const avg = total / qWords.length;
    if (worst < 0.55 || avg < 0.65) return 0;
    return Math.round(300 + avg * 400);
  }

  // ---------- helpers ----------

  function fieldDef(key) {
    return FIELDS[key] || { label: key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), section: 'Other' };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function prettyDate(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v + 'T00:00:00');
    if (isNaN(d)) return v;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function toast(msg, warn) {
    const el = $('save-status');
    el.textContent = msg;
    el.classList.toggle('warn', !!warn);
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, warn ? 6000 : 3000);
  }

  // ---------- edit mode ----------

  const edit = {
    data: null,
    index: [],
    selectedId: null,
    fileHandle: null,
    dirty: false,

    async start() {
      $('edit-screen').hidden = false;
      this.data = loadData();
      this.fileHandle = await handleStore.get();
      $('editor-name').value = localStorage.getItem(KEY_EDITOR) || '';

      $('load-file').onclick = () => this.pickFile();
      $('load-file-empty').onclick = () => this.pickFile();
      $('file-input').onchange = (e) => {
        const f = e.target.files[0];
        e.target.value = '';
        if (f) this.useFile(f, null);
      };
      $('export-csv').onclick = () => this.exportFile('csv');
      $('export-xlsx').onclick = () => this.exportFile('xlsx');
      $('open-view').onclick = () => window.open(location.href.split('#')[0] + '#view', '_blank');
      $('search').oninput = () => this.renderList();
      $('close-member').onclick = () => this.select(null);
      $('member-form').onsubmit = (e) => { e.preventDefault(); this.save(); };
      $('member-form').oninput = (e) => this.markDirty(e.target);
      $('member-form').onchange = (e) => this.markDirty(e.target);
      $('editor-name').oninput = (e) => {
        try { localStorage.setItem(KEY_EDITOR, e.target.value); } catch (err) { /* ignore */ }
      };
      window.addEventListener('beforeunload', (e) => {
        if (this.dirty) { e.preventDefault(); e.returnValue = ''; }
      });

      this.refresh();
      const cur = getCurrent();
      if (this.data && cur && this.findRow(cur.id)) this.select(cur.id);
    },

    refresh() {
      const has = !!(this.data && this.data.rows.length);
      $('no-data').hidden = has;
      $('edit-main').hidden = !has;
      $('export-csv').disabled = !has;
      $('export-xlsx').disabled = !has;
      if (!has) { $('file-info').textContent = ''; return; }
      const d = this.data;
      $('file-info').textContent = d.fileName + ' · ' + d.rows.length + ' members' +
        (d.changed.length ? ' · ' + d.changed.length + ' updated' : '');
      this.index = d.rows.map((r) => {
        const name = norm(r[d.nameKey]);
        const words = name.split(' ').filter(Boolean);
        return { row: r, id: String(r[d.idKey]).trim(), name: name, words: words, sortedWords: words.slice().sort().join(' ') };
      });
      this.renderList();
    },

    async pickFile() {
      if (this.dirty && !confirm('You have unsaved changes on this member. Discard them?')) return;
      if (this.data && this.data.unexported &&
          !confirm('Some changes have not been exported or saved to a file yet. Loading a new file will replace them. Continue?')) return;
      if (window.showOpenFilePicker) {
        try {
          const [handle] = await window.showOpenFilePicker({
            types: [{ description: 'Tajneed file', accept: {
              'text/csv': ['.csv'],
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            } }],
          });
          await this.useFile(await handle.getFile(), handle);
        } catch (e) {
          if (e.name !== 'AbortError') $('file-input').click();
        }
      } else {
        $('file-input').click();
      }
    },

    async useFile(file, handle) {
      try {
        const data = await readTable(file);
        if (!saveData(data)) return;
        this.data = data;
        this.fileHandle = handle;
        await handleStore.set(handle);
        this.dirty = false;
        this.select(null);
        $('search').value = '';
        this.refresh();
        toast('Loaded ' + data.rows.length + ' members from ' + file.name);
      } catch (e) {
        alert('Could not read the file.\n\n' + e.message);
      }
    },

    findRow(id) {
      return this.data.rows.find((r) => String(r[this.data.idKey]) === String(id));
    },

    renderList() {
      const q = norm($('search').value);
      let items;
      if (!q) {
        items = this.index.slice().sort((a, b) => a.name.localeCompare(b.name));
      } else {
        const qWords = q.split(' ');
        items = this.index
          .map((e) => ({ e: e, s: scoreMember(e, q, qWords) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
          .map((x) => x.e);
      }
      const d = this.data;
      const changed = new Set(d.changed);
      const shown = items.slice(0, MAX_RESULTS);
      $('result-count').textContent = items.length + (items.length === 1 ? ' member' : ' members') +
        (items.length > shown.length ? ' (showing first ' + shown.length + ')' : '');
      $('member-list').innerHTML = shown.map((e) => {
        const r = e.row;
        const meta = [e.id, r.majlis, r.auxiliary].filter(Boolean).map(escapeHtml).join(' · ');
        const cls = [e.id === this.selectedId ? 'selected' : '', changed.has(e.id) ? 'changed' : ''].join(' ');
        return '<li data-id="' + escapeHtml(e.id) + '" class="' + cls + '">' +
          '<div class="name">' + escapeHtml(r[d.nameKey]) + '</div><div class="meta">' + meta + '</div></li>';
      }).join('');
      $('member-list').querySelectorAll('li').forEach((li) => {
        li.onclick = () => this.select(li.dataset.id);
      });
    },

    select(id) {
      if (this.dirty && id !== this.selectedId &&
          !confirm('You have unsaved changes on this member. Discard them?')) return;
      this.dirty = false;
      this.selectedId = id;
      setCurrent(id);
      $('member-list').querySelectorAll('li').forEach((li) => {
        li.classList.toggle('selected', li.dataset.id === id);
      });
      const row = id != null && this.findRow(id);
      $('member-form').hidden = !row;
      $('detail-empty').hidden = !!row;
      if (row) this.renderForm(row);
    },

    renderForm(row) {
      const d = this.data;
      $('form-title').textContent = row[d.nameKey] + ' (' + row[d.idKey] + ')';
      const bySection = {};
      d.columns.forEach((c) => {
        const def = fieldDef(c.key);
        (bySection[def.section] = bySection[def.section] || []).push(c);
      });
      let html = '';
      SECTIONS.forEach((section) => {
        const cols = bySection[section];
        if (!cols) return;
        html += '<h3 class="form-section-title">' + section + '</h3>';
        cols.forEach((c) => {
          const def = fieldDef(c.key);
          const v = row[c.key] == null ? '' : row[c.key];
          const id = 'f_' + c.key;
          let input;
          if (def.options) {
            const opts = def.options.includes(v) || v === '' ? def.options : [v].concat(def.options);
            input = '<select id="' + id + '" name="' + c.key + '"><option value=""></option>' +
              opts.map((o) => '<option' + (o === v ? ' selected' : '') + '>' + escapeHtml(o) + '</option>').join('') +
              '</select>';
          } else if (def.textarea) {
            input = '<textarea id="' + id + '" name="' + c.key + '" rows="2">' + escapeHtml(v) + '</textarea>';
          } else {
            const type = def.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v) && v ? 'text' : (def.type || 'text');
            const list = def.suggest ? ' list="dl_' + c.key + '"' : '';
            input = '<input id="' + id + '" name="' + c.key + '" type="' + type + '" value="' + escapeHtml(v) + '"' + list + '>';
            if (def.suggest) {
              const values = Array.from(new Set(d.rows.map((r) => r[c.key]).filter(Boolean))).sort();
              input += '<datalist id="dl_' + c.key + '">' + values.map((x) => '<option value="' + escapeHtml(x) + '">').join('') + '</datalist>';
            }
          }
          html += '<div class="field' + (def.wide ? ' wide' : '') + '"><label for="' + id + '">' +
            escapeHtml(def.label) + '</label>' + input + '</div>';
        });
      });
      $('form-fields').innerHTML = html;
    },

    markDirty(el) {
      if (!el.name || !this.selectedId) return;
      const row = this.findRow(this.selectedId);
      el.closest('.field').classList.toggle('dirty', el.value !== (row[el.name] || ''));
      this.dirty = !!$('form-fields').querySelector('.field.dirty');
    },

    async save() {
      const d = this.data;
      const row = this.findRow(this.selectedId);
      if (!row) return;
      const updated = Object.assign({}, row);
      d.columns.forEach((c) => {
        const el = $('f_' + c.key);
        if (el) updated[c.key] = el.value.trim();
      });
      const newId = String(updated[d.idKey]);
      if (!newId) { alert('AIMS ID cannot be empty.'); return; }
      if (newId !== this.selectedId && this.findRow(newId)) {
        alert('Another member already has AIMS ID ' + newId + '.'); return;
      }
      if ('last_verified_date' in updated) updated.last_verified_date = todayIso();
      const editor = $('editor-name').value.trim();
      if ('verified_by' in updated && editor) updated.verified_by = editor;

      Object.assign(row, updated);
      d.changed = d.changed.filter((x) => x !== this.selectedId && x !== newId);
      d.changed.push(newId);
      d.unexported = true;
      if (!saveData(d)) return;

      this.dirty = false;
      if (newId !== this.selectedId) { this.selectedId = newId; setCurrent(newId); }
      this.refresh();
      this.renderForm(row);

      if (this.fileHandle) {
        const ok = await this.writeToFile();
        toast(ok ? 'Saved to ' + d.fileName : 'Saved in browser only. Use Export to update the file.', !ok);
      } else {
        toast('Saved in browser. Use Export to update the file.');
      }
    },

    // Chrome/Edge only: overwrite the file that was opened.
    async writeToFile() {
      const d = this.data;
      const h = this.fileHandle;
      if (d.fileType === 'xlsx' && d.sheetCount > 1) return false; // don't wipe other sheets
      try {
        let perm = await h.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') perm = await h.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') return false;
        const w = await h.createWritable();
        await w.write(d.fileType === 'csv' ? toCsv(d.columns, d.rows) : toXlsx(d.columns, d.rows));
        await w.close();
        d.unexported = false;
        saveData(d);
        return true;
      } catch (e) {
        console.warn('Save to file failed', e);
        return false;
      }
    },

    exportFile(kind) {
      const d = this.data;
      const base = d.fileName.replace(/\.[^.]+$/, '') + '-updated-' + todayIso();
      if (kind === 'csv') download(base + '.csv', toCsv(d.columns, d.rows), 'text/csv;charset=utf-8');
      else download(base + '.xlsx', toXlsx(d.columns, d.rows),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      d.unexported = false;
      saveData(d);
    },
  };

  // ---------- view mode ----------

  const view = {
    shownId: null,
    shownValues: {},

    start() {
      $('view-screen').hidden = false;
      document.title = 'Tajneed - View';
      window.addEventListener('storage', (e) => {
        if (e.key === KEY_DATA || e.key === KEY_CURRENT || e.key === null) this.render();
      });
      this.render();
    },

    render() {
      const data = loadData();
      const cur = getCurrent();
      const row = data && cur && data.rows.find((r) => String(r[data.idKey]) === String(cur.id));
      $('view-waiting').hidden = !!row;
      $('view-member').hidden = !row;
      if (!row) { this.shownId = null; return; }

      const sameMember = this.shownId === cur.id;
      const changedKeys = sameMember
        ? data.columns.filter((c) => (this.shownValues[c.key] || '') !== (row[c.key] || '')).map((c) => c.key)
        : [];
      if (sameMember && !changedKeys.length) return;

      $('view-name').textContent = row[data.nameKey];
      const bySection = {};
      data.columns.forEach((c) => {
        const def = fieldDef(c.key);
        if (def.hideInView) return;
        (bySection[def.section] = bySection[def.section] || []).push(c);
      });
      $('view-sections').innerHTML = SECTIONS.filter((s) => bySection[s]).map((s) =>
        '<div class="view-section"><h2>' + s + '</h2><div class="view-grid">' +
        bySection[s].map((c) => {
          const def = fieldDef(c.key);
          const v = row[c.key] || '';
          const shown = def.type === 'date' ? prettyDate(v) : v;
          return '<div class="view-item' + (def.wide ? ' wide' : '') + (changedKeys.includes(c.key) ? ' flash' : '') + '">' +
            '<div class="label">' + escapeHtml(def.label) + '</div>' +
            '<div class="value' + (v ? '' : ' blank') + '">' + (v ? escapeHtml(shown) : 'Not given') + '</div></div>';
        }).join('') + '</div></div>').join('');

      const upd = $('view-updated');
      upd.hidden = !changedKeys.length;
      clearTimeout(this.t);
      if (changedKeys.length) this.t = setTimeout(() => { upd.hidden = true; }, 4000);
      if (!sameMember) window.scrollTo(0, 0);

      this.shownId = cur.id;
      this.shownValues = Object.assign({}, row);
    },
  };

  // ---------- start ----------

  function route() {
    const mode = location.hash.replace('#', '');
    ['start-screen', 'edit-screen', 'view-screen'].forEach((id) => { $(id).hidden = true; });
    if (mode === 'edit') edit.start();
    else if (mode === 'view') view.start();
    else {
      $('start-screen').hidden = false;
      $('choose-edit').onclick = () => { location.hash = 'edit'; location.reload(); };
      $('choose-view').onclick = () => { location.hash = 'view'; location.reload(); };
    }
  }

  // Exposed for tests
  window.TajneedSearch = { norm: norm, scoreMember: scoreMember, parseCsv: parseCsv, toCsv: toCsv };

  route();
})();
