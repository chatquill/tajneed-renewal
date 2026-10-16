/* Tajneed Renewal - works offline from file://, no server needed.
 *
 * Data lives in localStorage so the Edit tab and the View tab (same browser)
 * share it. The View tab listens for `storage` events to update live.
 */
(function () {
  'use strict';

  const KEY_DATA = 'tajneed:data';
  const KEY_CURRENT = 'tajneed:current';
  const MAX_RESULTS = 300;

  // Columns of the tajneed sheet (header "AMJS ID" -> key "amjs_id").
  // Any other column in the file still shows up, under "Other".
  const FIELDS = {
    amjs_id: { label: 'AMJS ID', section: 'Member' },
    name: { label: 'Name', section: 'Member', wide: true },
    date_of_birth: { label: 'Date of Birth', section: 'Member', date: true },
    age: { label: 'Age', section: 'Member', readonly: true },
    marital_status: { label: 'Marital Status', section: 'Member', suggest: ['Single', 'Married', 'Divorced', 'Widowed'] },
    tanzeem: { label: 'Tanzeem', section: 'Member', suggest: ['Atfal', 'Khuddam', 'Ansar', 'Nasirat', 'Lajna'] },
    branch: { label: 'Branch', section: 'Member', suggest: [] },
    record_status: { label: 'Record Status', section: 'Member', suggest: ['Active', 'Inactive'], hideInView: true },
    mobile: { label: 'Mobile', section: 'Contact', type: 'tel' },
    telephone_res: { label: 'Telephone (Home)', section: 'Contact', type: 'tel' },
    telephone_work: { label: 'Telephone (Work)', section: 'Contact', type: 'tel' },
    telephone_other: { label: 'Telephone (Other)', section: 'Contact', type: 'tel' },
    email: { label: 'Email', section: 'Contact', type: 'email', wide: true },
    address_1: { label: 'Address 1', section: 'Address', address: true },
    address_2: { label: 'Address 2', section: 'Address', address: true },
    address_3: { label: 'Address 3', section: 'Address', address: true },
    address_4: { label: 'Address 4', section: 'Address', address: true },
    city: { label: 'City', section: 'Address', address: true, suggest: [] },
    post_code: { label: 'Post Code', section: 'Address', address: true },
    country: { label: 'Country', section: 'Address', address: true, suggest: ['United Kingdom'] },
    family_code: { label: 'Family Code', section: 'Family' },
    relationship_to_hof: { label: 'Relationship to Head of Family', section: 'Family', suggest: ['Self', 'Wife', 'Husband', 'Son', 'Daughter', 'Mother', 'Father'] },
    wasiyyat_number: { label: 'Wasiyyat Number', section: 'Wasiyyat & Waqf-e-Nau' },
    wasiyyat_status: { label: 'Wasiyyat Status', section: 'Wasiyyat & Waqf-e-Nau', suggest: ['M'] },
    waqf_e_nau_number: { label: 'Waqf-e-Nau Number', section: 'Wasiyyat & Waqf-e-Nau', zeroIsNone: true },
  };
  const SECTIONS = ['Member', 'Contact', 'Address', 'Family', 'Wasiyyat & Waqf-e-Nau', 'Other'];

  // Header names accepted for the two required columns.
  const ID_KEYS = ['amjs_id', 'aims_id', 'amjs', 'aims', 'member_id', 'id'];
  const NAME_KEYS = ['name', 'full_name', 'member_name'];

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
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, dateNF: 'dd/mm/yyyy' });
      sheetCount = wb.SheetNames.length;
      const ws = wb.Sheets[wb.SheetNames[0]];
      table = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, dateNF: 'dd/mm/yyyy', blankrows: false })
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

  // Accepts dd/mm/yyyy (UK) or yyyy-mm-dd. Returns a Date or null.
  function parseDate(v) {
    v = String(v || '').trim();
    let m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    let y, mo, d;
    if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    else if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else return null;
    const date = new Date(y, mo - 1, d);
    return date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
  }

  function ageFrom(v) {
    const dob = parseDate(v);
    if (!dob) return '';
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
    return age >= 0 ? String(age) : '';
  }

  function prettyDate(v) {
    const d = parseDate(v);
    return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : v;
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
        const meta = [e.id, r.branch, r.tanzeem].filter(Boolean).map(escapeHtml).join(' · ');
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
      // Group by section, in the order FIELDS lists them (unknown columns last)
      const order = Object.keys(FIELDS);
      const rank = (k) => (order.includes(k) ? order.indexOf(k) : order.length);
      const bySection = {};
      d.columns.slice().sort((a, b) => rank(a.key) - rank(b.key)).forEach((c) => {
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
          const attrs = ' id="' + id + '" name="' + c.key + '" value="' + escapeHtml(v) + '"';
          if (def.readonly) {
            input = '<input' + attrs + ' readonly tabindex="-1">';
          } else if (def.date) {
            input = '<input' + attrs + ' placeholder="dd/mm/yyyy">';
          } else if (def.suggest) {
            const values = Array.from(new Set(def.suggest.concat(d.rows.map((r) => r[c.key])).filter(Boolean))).sort();
            input = '<input' + attrs + ' list="dl_' + c.key + '" autocomplete="off">' +
              '<datalist id="dl_' + c.key + '">' + values.map((x) => '<option value="' + escapeHtml(x) + '">').join('') + '</datalist>';
          } else {
            input = '<input' + attrs + ' type="' + (def.type || 'text') + '">';
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
      // Age follows Date of Birth
      if (el.name === 'date_of_birth' && $('f_age')) {
        const age = ageFrom(el.value);
        if (age) { $('f_age').value = age; this.markDirty($('f_age')); }
      }
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
      if (!newId) { alert('AMJS ID cannot be empty.'); return; }
      if (newId !== this.selectedId && this.findRow(newId)) {
        alert('Another member already has AMJS ID ' + newId + '.'); return;
      }
      if (updated.date_of_birth && !parseDate(updated.date_of_birth) &&
          !confirm('Date of Birth "' + updated.date_of_birth + '" is not in dd/mm/yyyy format. Save anyway?')) return;

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
      window.addEventListener('resize', () => this.fit());
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
      $('view-id').textContent = data.idKey in FIELDS ? FIELDS[data.idKey].label + ' ' + row[data.idKey] : row[data.idKey];

      const has = (k) => data.columns.some((c) => c.key === k);
      const item = (label, keys, value, opts) => {
        opts = opts || {};
        const flash = keys.some((k) => changedKeys.includes(k));
        const blank = !value;
        return '<div class="view-item' + (opts.wide ? ' wide' : '') + (flash ? ' flash' : '') + '">' +
          '<div class="label">' + escapeHtml(label) + '</div>' +
          '<div class="value' + (blank ? ' blank' : '') + (opts.multiline ? ' multiline' : '') + (opts.nowrap ? ' nowrap' : '') + '">' +
          (blank ? (opts.blankText || 'Not given') : escapeHtml(value)) + '</div></div>';
      };
      const field = (k, opts) => {
        if (!has(k)) return '';
        const def = fieldDef(k);
        let v = row[k] || '';
        if (def.zeroIsNone && /^0*$/.test(v)) return item(def.label, [k], '', { blankText: 'None' });
        return item(def.label, [k], v, opts);
      };
      const card = (title, body, cls) => body ? '<div class="view-section ' + (cls || '') + '"><h2>' + title + '</h2><div class="view-grid">' + body + '</div></div>' : '';

      let dobText = '';
      if (has('date_of_birth') && row.date_of_birth) {
        const age = ageFrom(row.date_of_birth) || row.age;
        dobText = prettyDate(row.date_of_birth) + (age ? ' (age\u00a0' + age + ')' : '');
      }
      const member = (has('date_of_birth') ? item('Date of Birth', ['date_of_birth', 'age'], dobText) : field('age')) +
        field('marital_status') + field('tanzeem') + field('branch');
      const nw = { nowrap: true };
      const contact = field('mobile', nw) + field('telephone_res', nw) + field('telephone_work', nw) +
        field('telephone_other', nw) + field('email', { wide: true, nowrap: true });
      const addrKeys = ['address_1', 'address_2', 'address_3', 'address_4', 'city', 'post_code', 'country'].filter(has);
      const address = addrKeys.length
        ? item('Address', addrKeys, addrKeys.map((k) => row[k]).filter(Boolean).join('\n'), { wide: true, multiline: true })
        : '';
      const family = field('family_code') + field('relationship_to_hof');
      const wasiyyat = field('wasiyyat_number') + field('wasiyyat_status') + field('waqf_e_nau_number');
      const other = data.columns.filter((c) => !FIELDS[c.key] && c.key !== data.idKey && c.key !== data.nameKey)
        .map((c) => field(c.key)).join('');

      $('view-sections').innerHTML =
        card('Personal', member) + card('Contact', contact) + card('Address', address, 'address') +
        card('Family', family) + card('Wasiyyat &amp; Waqf-e-Nau', wasiyyat) + card('Other', other);
      this.fit();

      const upd = $('view-updated');
      upd.hidden = !changedKeys.length;
      clearTimeout(this.t);
      if (changedKeys.length) this.t = setTimeout(() => { upd.hidden = true; }, 4000);

      this.shownId = cur.id;
      this.shownValues = Object.assign({}, row);
    },

    // Make the text as large as possible while everything still fits on one screen.
    fit() {
      const screen = $('view-screen');
      if ($('view-member').hidden) return;
      const overflows = () => screen.scrollHeight > window.innerHeight || screen.scrollWidth > window.innerWidth ||
        Array.from(screen.querySelectorAll('.value.nowrap')).some((v) => v.scrollWidth > v.clientWidth + 1);
      let size = 40;
      screen.style.fontSize = size + 'px';
      while (size > 9 && overflows()) {
        size -= 0.5;
        screen.style.fontSize = size + 'px';
      }
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
