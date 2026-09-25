(() => {
  'use strict';

  const STORAGE_KEY = 'cross-college-state-v2';
  const EMPTY = { students: [], races: [], arrivals: [], classTeachers: {}, crossDistanceM: 0, scannerSeen: false, scannerLastAt: 0, tab: 'students', notice: 'Scanner en attente', lastScan: '', resultRaceId: '' };
  const DEMO = [
    [101,'DUPONT','Lina','6A','6e','F','Mme Martin'], [102,'MARTIN','Noé','6A','6e','M','Mme Martin'],
    [103,'BERNARD','Inès','6B','6e','F','M. Robert'], [104,'PETIT','Lucas','6B','6e','M','M. Robert'],
    [105,'MOREAU','Emma','5A','5e','F','Mme Garcia'], [106,'RICHARD','Jules','5A','5e','M','Mme Garcia'],
    [107,'DURAND','Chloé','5B','5e','F','M. Lopez'], [108,'SIMON','Hugo','5B','5e','M','M. Lopez'],
    [109,'LAURENT','Sarah','4A','4e','F','Mme Bernard'], [110,'MICHEL','Nathan','4A','4e','M','Mme Bernard'],
    [111,'GARCIA','Léa','3A','3e','F','M. Petit'], [112,'ROUX','Tom','3A','3e','M','M. Petit']
  ];

  let state = load();
  let manualStamp = null;
  let manualQuery = '';
  let scanBuffer = '';
  let scanLastKey = 0;
  const app = document.getElementById('app');
  const $ = s => document.querySelector(s);
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const nameOf = s => `${String(s.lastName || '').toUpperCase()} ${s.firstName || ''}`.trim();
  const raceOf = id => state.races.find(r => r.id === id);
  const fmt = ms => {
    if (ms == null || !Number.isFinite(ms)) return '—';
    const sec = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2,'0')}`;
  };
  const avg = a => a.length ? a.reduce((x,y) => x + y, 0) / a.length : null;
  const speedKmh = s => { if(!state.crossDistanceM || !s.elapsedMs) return null; return (state.crossDistanceM / (s.elapsedMs / 1000)) * 3.6; };
  const fmtSpeed = s => { const v=speedKmh(s); return v==null ? '—' : `${v.toFixed(1)} km/h`; };
  const classNames = () => [...new Set(state.students.map(s => s.className).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));

  function load() {
    try { return { ...EMPTY, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) }; }
    catch { return { ...EMPTY }; }
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function notify(msg) { state.notice = msg; save(); render(); }

  function render() {
    const tabs = [['students','1. Élèves & dossards'],['races','2. Courses'],['timing','3. Chronométrage'],['results','4. Résultats']];
    app.innerHTML = `<div class="app-shell">
      <header class="topbar"><div><h1>Cross Collège</h1><p>Chronométrage iPad · dossards · résultats</p></div><div class="status-pill">${esc(state.notice)}</div></header>
      <nav class="tabs">${tabs.map(([id,label]) => `<button data-tab="${id}" class="${state.tab===id?'active':''}">${label}</button>`).join('')}</nav>
      <main>${page()}</main>${manualStamp !== null ? manualModal() : ''}
    </div>`;
    bind();
  }

  function page() {
    if (state.tab === 'students') return studentsPage();
    if (state.tab === 'races') return racesPage();
    if (state.tab === 'timing') return timingPage();
    return resultsPage();
  }

  function studentsPage() {
    return `<section class="page-grid">
      <div class="card span-2"><div class="card-head"><div><h2>Liste des élèves</h2><p>Importe un fichier Excel, XLSX ou CSV.</p></div><strong>${state.students.length} élèves</strong></div>
        <div class="actions">
          <label class="button primary file-button">Importer Excel / CSV<input id="student-file" type="file" accept=".xlsx,.xls,.csv"></label>
          <button class="button demo" id="demo">Charger la démo</button>
          <button class="button" id="template">Télécharger le modèle</button>
          <button class="button" id="bibs" ${state.students.length?'':'disabled'}>Créer les dossards PDF</button>
        </div>
        <p class="hint">Colonnes reconnues : Nom, Prénom, Classe, Niveau, Sexe, Enseignant/PP, Dossard. Si le dossard manque, il est attribué automatiquement.</p>
      </div>
      <div class="card span-2 table-card"><table><thead><tr><th>Dossard</th><th>Élève</th><th>Classe</th><th>Niveau</th><th>Sexe</th><th>Course</th></tr></thead><tbody>
        ${state.students.map(s => `<tr><td class="bib">#${s.bib}</td><td>${esc(nameOf(s))}</td><td>${esc(s.className)}</td><td>${esc(s.level)}</td><td>${esc(s.sex)}</td><td>${esc(s.raceId ? (raceOf(s.raceId)?.name || 'Affectée') : '—')}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="card span-2"><div class="card-head"><div><h2>Classes & professeurs</h2><p>Rattache chaque classe à un ou deux professeurs pour calculer le classement enseignants.</p></div></div>
        <div class="class-teacher-grid">${classNames().map(cls => { const t=state.classTeachers?.[cls]||[]; return `<div class="class-teacher-row"><strong>${esc(cls)}</strong><input data-teacher1="${esc(cls)}" value="${esc(t[0]||'')}" placeholder="Professeur 1"><input data-teacher2="${esc(cls)}" value="${esc(t[1]||'')}" placeholder="Professeur 2"><button class="button" data-save-teachers="${esc(cls)}">Enregistrer</button></div>`; }).join('')}</div>
      </div>
    </section>`;
  }

  function racesPage() {
    const levels = [...new Set(state.students.map(s => s.level).filter(Boolean))].sort();
    return `<section class="page-grid">
      <div class="card span-2"><div class="card-head"><div><h2>Paramètres du cross</h2><p>Réglage commun à toutes les courses.</p></div><strong>${state.crossDistanceM ? `${state.crossDistanceM} m` : 'À renseigner'}</strong></div>
        <div class="inline-setting"><label class="field">Distance unique du cross (mètres)<input id="cross-distance" type="number" min="100" step="10" inputmode="numeric" value="${state.crossDistanceM || ''}" placeholder="Ex. 1500"></label><button class="button primary" id="save-settings">Enregistrer</button></div>
      </div>
      <div class="card"><h2>Créer une course</h2>
        <label class="field">Nom de la course<input id="race-name" placeholder="Ex. 6e filles"></label>
        <div class="field"><span>Niveaux</span><div class="chip-row">${levels.map(l => `<button class="chip" data-level="${esc(l)}">${esc(l)}</button>`).join('')}</div></div>
        <div class="field"><span>Sexe</span><div class="chip-row"><button class="chip" data-sex="F">Filles</button><button class="chip" data-sex="M">Garçons</button><button class="chip" data-sex="X">Non renseigné</button></div></div>
        <button class="button primary full" id="create-race">Créer et affecter les élèves</button>
      </div>
      <div class="card"><h2>Courses</h2><div class="race-list">${state.races.length ? state.races.map(r => {
        const runners = state.students.filter(s => s.raceId === r.id);
        const done = runners.filter(s => s.elapsedMs != null).length;
        return `<div class="race-row"><div><strong>${esc(r.name)}</strong><span>${runners.length} élèves · ${r.levels.map(esc).join(', ')} · ${r.sexes.join('/')} · ${state.crossDistanceM ? `${state.crossDistanceM} m` : 'distance à régler'}</span>${r.startedAt ? `<span>Démarrée à ${new Date(r.startedAt).toLocaleTimeString('fr-FR')}</span>` : ''}${r.endedAt ? `<span>Terminée à ${new Date(r.endedAt).toLocaleTimeString('fr-FR')}</span>` : ''}</div>
          <div class="race-actions">${!r.startedAt ? `<button class="button danger-ghost" data-delete="${r.id}">Supprimer</button><button class="button start" data-start="${r.id}">DÉPART</button>` : r.endedAt ? `<span class="started">${done}/${runners.length} classés · ${runners.length-done} absents/non arrivés</span><button class="button" data-reopen="${r.id}">Réouvrir</button>` : `<span class="started">${done}/${runners.length} arrivés</span><button class="button finish-race" data-finish-race="${r.id}">TERMINER</button>`}</div></div>`;
      }).join('') : '<p class="empty">Aucune course créée.</p>'}</div></div>
    </section>`;
  }

  function timingPage() {
    const active = state.races.filter(r => r.startedAt != null && !r.endedAt);
    const pending = state.students.filter(s => s.raceId && raceOf(s.raceId)?.startedAt && !raceOf(s.raceId)?.endedAt && s.elapsedMs == null).length;
    const done = state.students.filter(s => s.elapsedMs != null).length;
    return `<section class="timing-layout">
      <div class="card timing-main"><div class="timing-title"><div><h2>Arrivées</h2><p>Scanne un dossard : le temps est enregistré immédiatement.</p></div><div class="live-dot ${state.scannerSeen?'ready':''}">${state.scannerSeen?'● SCANNER OPÉRATIONNEL':'○ SCANNER NON TESTÉ'}</div></div>
        <div class="big-notice">${esc(state.notice)}</div>
        <div class="timing-stats"><div><strong>${active.length}</strong><span>courses démarrées</span></div><div><strong>${pending}</strong><span>élèves encore en course</span></div><div><strong>${done}</strong><span>arrivées enregistrées</span></div></div>
        <div class="actions giant-actions"><button class="button warning" id="no-bib">SANS DOSSARD</button><button class="button" id="undo">Annuler la dernière arrivée</button><button class="button" id="test-scan">Tester le scanner</button></div>
        <p class="hint">Dernier code reçu : <strong>${esc(state.lastScan || 'aucun')}</strong>${state.scannerLastAt ? ` · ${new Date(state.scannerLastAt).toLocaleTimeString('fr-FR')}` : ''}. Le lecteur doit être jumelé en Bluetooth HID et envoyer Entrée après le code.</p>
        <div class="recent-arrivals"><h3>Dernières arrivées</h3>${state.arrivals.slice(-8).reverse().map(a=>{const s=state.students.find(x=>x.id===a.studentId);return s?`<div class="recent-arrival"><strong>#${s.bib} ${esc(nameOf(s))}</strong><span>${fmt(a.elapsedMs)} · ${esc(raceOf(a.raceId)?.name||'')}</span></div>`:'';}).join('') || '<p class="empty">Aucune arrivée enregistrée.</p>'}</div>
      </div>
      <div class="card"><h2>Courses actives</h2><div class="race-list">${active.length ? active.map(r => {
        const runners = state.students.filter(s => s.raceId === r.id), done = runners.filter(s => s.elapsedMs != null).length;
        return `<div class="race-row compact"><div><strong>${esc(r.name)}</strong><span>Départ ${new Date(r.startedAt).toLocaleTimeString('fr-FR')} · ${state.crossDistanceM ? `${state.crossDistanceM} m` : 'distance à régler'}</span></div><div class="race-actions"><strong>${done}/${runners.length}</strong><button class="button finish-race" data-finish-race="${r.id}">TERMINER</button></div></div>`;
      }).join('') : '<p class="empty">Aucune course démarrée.</p>'}</div></div>
    </section>`;
  }

  function resultsPage() {
    const g = rankings(), done = state.students.filter(s => s.elapsedMs != null).length;
    const ended = state.races.filter(r => r.endedAt);
    const selectedRaceId = state.resultRaceId && ended.some(r=>r.id===state.resultRaceId) ? state.resultRaceId : (ended[0]?.id || '');
    const selectedRace = raceOf(selectedRaceId);
    const raceRows = g.byRace.filter(r=>r.raceId===selectedRaceId);
    const runners = selectedRace ? state.students.filter(s=>s.raceId===selectedRace.id) : [];
    return `<section class="results-layout">
      <div class="card results-top">
        <div class="card-head"><div><h2>Résultats</h2><p>${done} élèves classés · ${ended.length} course(s) terminée(s).</p></div>
          <button class="button primary" id="export-all-results" ${done?'':'disabled'}>Exporter tous les résultats</button>
        </div>
      </div>

      <div class="card results-sidebar">
        <h3>Courses terminées</h3>
        <div class="race-list">${ended.length ? ended.map(r => {
          const rr=state.students.filter(s=>s.raceId===r.id), classified=rr.filter(s=>s.elapsedMs!=null).length;
          return `<div class="result-race-item ${r.id===selectedRaceId?'selected':''}">
            <div><strong>${esc(r.name)}</strong><span>${classified}/${rr.length} classés</span></div>
            <div class="result-race-actions"><button class="button" data-view-race="${r.id}">Voir résultats</button><button class="button" data-export-race="${r.id}">Exporter résultats</button></div>
          </div>`;
        }).join('') : '<p class="empty">Aucune course terminée pour le moment.</p>'}</div>
      </div>

      <div class="card results-main table-card">
        ${selectedRace ? `<div class="card-head"><div><h3>${esc(selectedRace.name)}</h3><p>${runners.filter(s=>s.elapsedMs!=null).length} classés · ${runners.filter(s=>s.elapsedMs==null).length} absents/non classés · ${state.crossDistanceM ? state.crossDistanceM+' m' : 'distance non renseignée'}</p></div></div>
        <table><thead><tr><th>Rang</th><th>Dossard</th><th>Élève</th><th>Classe</th><th>Temps</th><th>Vitesse moy.</th></tr></thead><tbody>${raceRows.map(r=>`<tr><td>${r.rank}</td><td>#${r.bib}</td><td>${esc(r.name)}</td><td>${esc(r.className)}</td><td>${r.time}</td><td>${r.speed}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Sélectionne une course terminée pour afficher son classement.</p>'}
      </div>

      <div class="card table-card"><h3>Meilleure classe par niveau</h3><table><thead><tr><th>Niveau</th><th>Rang</th><th>Classe</th><th>Classés</th><th>Inscrits</th><th>Temps moyen</th></tr></thead><tbody>${g.classAverages.map(r => `<tr><td>${esc(r.level)}</td><td>${r.rank}</td><td>${esc(r.className)}</td><td>${r.count}</td><td>${r.enrolled}</td><td>${r.average}</td></tr>`).join('')}</tbody></table></div>
      <div class="card table-card"><h3>Meilleure classe du collège</h3><table><thead><tr><th>Rang</th><th>Classe</th><th>Niveau</th><th>Classés</th><th>Inscrits</th><th>Temps moyen</th></tr></thead><tbody>${g.classOverall.map(r => `<tr><td>${r.rank}</td><td>${esc(r.className)}</td><td>${esc(r.level)}</td><td>${r.count}</td><td>${r.enrolled}</td><td>${r.average}</td></tr>`).join('')}</tbody></table></div>
      <div class="card span-2 table-card"><h3>Classement des professeurs</h3><table><thead><tr><th>Rang</th><th>Professeur</th><th>Classes</th><th>Élèves classés</th><th>Élèves inscrits</th><th>Temps moyen</th></tr></thead><tbody>${g.teacherAverages.map(r => `<tr><td>${r.rank}</td><td>${esc(r.teacher)}</td><td>${esc(r.classes.join(', '))}</td><td>${r.count}</td><td>${r.enrolled}</td><td>${r.average}</td></tr>`).join('')}</tbody></table></div>
    </section>`;
  }

  function manualModal() {
    const q = manualQuery.trim().toLowerCase();
    const candidates = state.students.filter(s => s.elapsedMs == null && s.raceId && raceOf(s.raceId)?.startedAt && !raceOf(s.raceId)?.endedAt && (!q || String(s.bib).includes(q) || nameOf(s).toLowerCase().includes(q) || String(s.className).toLowerCase().includes(q))).slice(0,30);
    return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><h2>Arrivée sans dossard</h2><p>Heure figée à ${new Date(manualStamp).toLocaleTimeString('fr-FR')}.</p></div><button class="close" id="close-modal">×</button></div>
      <input class="manual-search" id="manual-search" value="${esc(manualQuery)}" placeholder="Nom, 3 premières lettres, classe ou n° de dossard">
      <div class="candidate-list">${candidates.map(s => `<button data-manual="${s.id}"><strong>#${s.bib}</strong><span>${esc(nameOf(s))} · ${esc(s.className)}</span><small>${esc(raceOf(s.raceId)?.name || '')}</small></button>`).join('')}</div></div></div>`;
  }

  function bind() {
    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; save(); render(); });
    $('#student-file')?.addEventListener('change', e => importStudents(e.target.files?.[0]));
    $('#demo')?.addEventListener('click', loadDemo);
    $('#template')?.addEventListener('click', downloadTemplate);
    $('#bibs')?.addEventListener('click', exportBibs);
    document.querySelectorAll('.chip').forEach(b => b.onclick = () => b.classList.toggle('selected'));
    $('#create-race')?.addEventListener('click', createRace);
    document.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => deleteRace(b.dataset.delete));
    document.querySelectorAll('[data-start]').forEach(b => b.onclick = () => startRace(b.dataset.start));
    document.querySelectorAll('[data-finish-race]').forEach(b => b.onclick = () => finishRace(b.dataset.finishRace));
    document.querySelectorAll('[data-reopen]').forEach(b => b.onclick = () => reopenRace(b.dataset.reopen));
    document.querySelectorAll('[data-save-teachers]').forEach(b => b.onclick = () => saveClassTeachers(b.dataset.saveTeachers));
    $('#no-bib')?.addEventListener('click', () => { manualStamp = Date.now(); manualQuery = ''; render(); setTimeout(() => $('#manual-search')?.focus(), 30); });
    $('#close-modal')?.addEventListener('click', closeManual);
    $('#manual-search')?.addEventListener('input', e => { manualQuery = e.target.value; render(); setTimeout(() => { const x=$('#manual-search'); if(x){ x.focus(); x.setSelectionRange(x.value.length,x.value.length); } },0); });
    document.querySelectorAll('[data-manual]').forEach(b => b.onclick = () => manualFinish(b.dataset.manual));
    $('#undo')?.addEventListener('click', undoLast);
    $('#test-scan')?.addEventListener('click', () => notify('Mode test : scanne un dossard. Le code doit apparaître ici.'));
    $('#export-all-results')?.addEventListener('click', exportResultsPdf);
    document.querySelectorAll('[data-view-race]').forEach(b => b.onclick = () => { state.resultRaceId=b.dataset.viewRace; save(); render(); });
    document.querySelectorAll('[data-export-race]').forEach(b => b.onclick = () => exportRacePdf(b.dataset.exportRace));
    $('#save-settings')?.addEventListener('click', saveSettings);
  }

  function loadDemo() {
    if (state.students.length && !confirm('Remplacer les données actuelles par la démonstration ?')) return;
    const students = DEMO.map(([bib,lastName,firstName,className,level,sex,teacher]) => ({ id:uid(),bib,lastName,firstName,className,level,sex,teacher }));
    const r6 = { id:uid(), name:'Démo 6e', levels:['6e'], sexes:['F','M'], createdAt:Date.now() };
    const r5 = { id:uid(), name:'Démo 5e', levels:['5e'], sexes:['F','M'], createdAt:Date.now() };
    students.forEach(s => { if(s.level==='6e') s.raceId=r6.id; if(s.level==='5e') s.raceId=r5.id; });
    const classTeachers={}; students.forEach(s=>{ if(s.teacher){ if(!classTeachers[s.className]) classTeachers[s.className]=[]; if(!classTeachers[s.className].includes(s.teacher)) classTeachers[s.className].push(s.teacher); }}); Object.keys(classTeachers).forEach(k=>classTeachers[k]=classTeachers[k].slice(0,2));
    state = { ...EMPTY, students, races:[r6,r5], classTeachers, crossDistanceM:1000, notice:'Démo chargée : dossards 101 à 112. Distance test : 1000 m.' };
    save(); render();
  }

  function normalizeHeader(s) { return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''); }
  function pick(row, aliases) { const a=aliases.map(normalizeHeader); for(const [k,v] of Object.entries(row)) if(a.includes(normalizeHeader(k))) return v; return ''; }
  function sexOf(v) { const s=String(v??'').trim().toLowerCase(); if(['f','fille','femme','female','feminin','féminin'].includes(s)) return 'F'; if(['m','garcon','garçon','homme','male','masculin'].includes(s)) return 'M'; return 'X'; }
  function levelOf(cls, lvl) { if(String(lvl??'').trim()) return String(lvl).trim(); const m=String(cls??'').match(/(6|5|4|3)/); return m ? `${m[1]}e` : String(cls??'').trim(); }

  async function importStudents(file) {
    if (!file) return;
    try {
      let rows;
      if (file.name.toLowerCase().endsWith('.csv')) rows = parseCsv(await file.text());
      else {
        if (!window.XLSX) throw new Error('Module Excel indisponible. Recharge l’application avec Internet.');
        const wb=XLSX.read(await file.arrayBuffer()), ws=wb.Sheets[wb.SheetNames[0]];
        rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      }
      const students=rows.map((row,i) => {
        const className=String(pick(row,['classe','class','classname'])).trim();
        const bib=Number(pick(row,['dossard','numero','numéro','bib']));
        return { id:uid(), lastName:String(pick(row,['nom','lastname','name'])).trim(), firstName:String(pick(row,['prenom','prénom','firstname'])).trim(), className,
          level:levelOf(className,pick(row,['niveau','level'])), sex:sexOf(pick(row,['sexe','genre','sex'])), teacher:String(pick(row,['enseignant','professeur','professeurprincipal','pp','teacher'])).trim(), bib:Number.isFinite(bib)&&bib>0?bib:i+1 };
      }).filter(s => s.lastName && s.className);
      if (!students.length) throw new Error('Aucun élève détecté. Il faut au minimum Nom et Classe.');
      const used=new Set(); let next=1; for(const s of students){ if(used.has(s.bib)){ while(used.has(next)) next++; s.bib=next; } used.add(s.bib); while(used.has(next)) next++; }
      if (state.students.length && !confirm(`Remplacer les ${state.students.length} élèves actuels ? Les courses et chronos seront effacés.`)) return;
      const classTeachers={}; students.forEach(s=>{ if(s.teacher){ if(!classTeachers[s.className]) classTeachers[s.className]=[]; if(!classTeachers[s.className].includes(s.teacher)) classTeachers[s.className].push(s.teacher); }}); Object.keys(classTeachers).forEach(k=>classTeachers[k]=classTeachers[k].slice(0,2));
      state={...EMPTY,students,classTeachers,notice:`${students.length} élèves importés`}; save(); render();
    } catch(e) { notify(e.message || 'Import impossible'); }
  }

  function parseCsv(text) {
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean); if(!lines.length) return [];
    const sep=(lines[0].match(/;/g)||[]).length >= (lines[0].match(/,/g)||[]).length ? ';' : ',';
    const split=line => { const out=[]; let cur='', quoted=false; for(let i=0;i<line.length;i++){ const c=line[i]; if(c==='"'){ if(quoted && line[i+1]==='"'){cur+='"';i++;} else quoted=!quoted; } else if(c===sep && !quoted){out.push(cur);cur='';} else cur+=c; } out.push(cur); return out; };
    const head=split(lines[0]); return lines.slice(1).map(line => { const vals=split(line), o={}; head.forEach((h,i)=>o[h]=vals[i]??''); return o; });
  }

  function createRace() {
    const name=$('#race-name')?.value.trim();
    const levels=[...document.querySelectorAll('[data-level].selected')].map(x=>x.dataset.level);
    const sexes=[...document.querySelectorAll('[data-sex].selected')].map(x=>x.dataset.sex);
    if(!name) return notify('Donne un nom à la course');
    if(!levels.length || !sexes.length) return notify('Sélectionne au moins un niveau et un sexe');
    const runners=state.students.filter(s => !s.raceId && levels.includes(s.level) && sexes.includes(s.sex));
    if(!runners.length) return notify('Aucun élève disponible pour ces critères');
    const race={id:uid(),name,levels,sexes,createdAt:Date.now()}; state.races.push(race); runners.forEach(s=>s.raceId=race.id);
    state.notice=`${name} créée : ${runners.length} élèves`; save(); render();
  }
  function deleteRace(id) { const r=raceOf(id); if(!r || r.startedAt) return; if(!confirm(`Supprimer « ${r.name} » ?`)) return; state.students.forEach(s=>{if(s.raceId===id) delete s.raceId;}); state.races=state.races.filter(x=>x.id!==id); save(); render(); }
  function startRace(id) { const r=raceOf(id); if(!r || r.startedAt) return; if(!state.crossDistanceM) { state.tab='races'; return notify('Renseigne la distance du cross avant de lancer une course'); } if(!confirm(`Lancer maintenant « ${r.name} » ?`)) return; r.startedAt=Date.now(); delete r.endedAt; state.notice=`${r.name} lancée`; state.tab='timing'; save(); render(); }
  function finishRace(id) { const r=raceOf(id); if(!r?.startedAt || r.endedAt) return; const runners=state.students.filter(s=>s.raceId===id), missing=runners.filter(s=>s.elapsedMs==null).length; if(!confirm(`Terminer « ${r.name} » maintenant ? ${missing} élève(s) sans arrivée resteront non classés/absents.`)) return; r.endedAt=Date.now(); state.notice=`${r.name} terminée · ${missing} absent(s)/non arrivé(s)`; save(); render(); }
  function reopenRace(id) { const r=raceOf(id); if(!r?.endedAt) return; if(!confirm(`Réouvrir « ${r.name} » pour accepter de nouvelles arrivées ?`)) return; delete r.endedAt; state.notice=`${r.name} réouverte`; save(); render(); }
  function saveClassTeachers(className) { const a=document.querySelector(`[data-teacher1="${CSS.escape(className)}"]`)?.value.trim()||''; const b=document.querySelector(`[data-teacher2="${CSS.escape(className)}"]`)?.value.trim()||''; const arr=[a,b].filter(Boolean).filter((v,i,x)=>x.indexOf(v)===i); state.classTeachers ||= {}; state.classTeachers[className]=arr; state.notice=`Professeurs enregistrés pour ${className}`; save(); render(); }

  function finish(student, stamp, method) {
    if(student.elapsedMs != null) return notify(`${nameOf(student)} est déjà arrivé en ${fmt(student.elapsedMs)}`);
    const race=raceOf(student.raceId); if(!race?.startedAt) return notify(`La course de ${nameOf(student)} n’a pas démarré`); if(race.endedAt) return notify(`La course « ${race.name} » est terminée. Réouvre-la pour enregistrer cette arrivée.`);
    const elapsedMs=Math.max(0,stamp-race.startedAt); student.finishedAt=stamp; student.elapsedMs=elapsedMs;
    state.arrivals.push({id:uid(),studentId:student.id,raceId:race.id,stamp,elapsedMs,method}); state.notice=`#${student.bib} ${nameOf(student)} — ${fmt(elapsedMs)}${state.crossDistanceM ? ` — ${fmtSpeed(student)}` : ''}`; save(); render();
  }
  function scan(raw) { state.scannerSeen=true; state.scannerLastAt=Date.now(); state.lastScan=raw; const m=String(raw).trim().match(/(\d+)/); if(!m) return notify(`Code non reconnu : ${raw}`); const bib=Number(m[1]); const s=state.students.find(x=>x.bib===bib); if(!s) return notify(`Dossard ${bib} inconnu`); finish(s,Date.now(),'scan'); }
  function manualFinish(id) { const s=state.students.find(x=>x.id===id); if(!s || manualStamp===null) return; const stamp=manualStamp; manualStamp=null; manualQuery=''; finish(s,stamp,'manual'); }
  function closeManual(){ manualStamp=null; manualQuery=''; render(); }
  function undoLast(){ const a=state.arrivals.at(-1); if(!a) return notify('Aucune arrivée à annuler'); const s=state.students.find(x=>x.id===a.studentId); if(s){delete s.finishedAt; delete s.elapsedMs; state.notice=`Arrivée annulée : #${s.bib} ${nameOf(s)}`;} state.arrivals.pop(); save(); render(); }

  function rankings() {
    const finished=state.students.filter(s=>s.elapsedMs!=null), individual=[], byRace=[], byClass=[], classAverages=[], classOverall=[], teacherAverages=[];
    const indiv=new Map(); finished.forEach(s=>{const k=`${s.level}|${s.sex}`; if(!indiv.has(k)) indiv.set(k,[]); indiv.get(k).push(s);});
    [...indiv.entries()].sort().forEach(([k,a])=>{const[level,sex]=k.split('|');a.sort((x,y)=>x.elapsedMs-y.elapsedMs);a.forEach((s,i)=>individual.push({level,sex,rank:i+1,bib:s.bib,name:nameOf(s),className:s.className,time:fmt(s.elapsedMs)}));});
    state.races.forEach(r=>{ const a=finished.filter(s=>s.raceId===r.id).sort((x,y)=>x.elapsedMs-y.elapsedMs); a.forEach((s,i)=>byRace.push({raceId:r.id,raceName:r.name,rank:i+1,bib:s.bib,name:nameOf(s),className:s.className,time:fmt(s.elapsedMs),speed:fmtSpeed(s)})); });
    const classes=new Map(); finished.forEach(s=>{if(!classes.has(s.className)) classes.set(s.className,[]); classes.get(s.className).push(s);});
    [...classes.entries()].sort().forEach(([className,a])=>{a.sort((x,y)=>x.elapsedMs-y.elapsedMs);a.forEach((s,i)=>byClass.push({className,rank:i+1,bib:s.bib,name:nameOf(s),sex:s.sex,time:fmt(s.elapsedMs)}));});
    const lc=new Map(); finished.forEach(s=>{const k=`${s.level}|${s.className}`; if(!lc.has(k)) lc.set(k,[]); lc.get(k).push(s);});
    const levels=new Map(); [...lc.entries()].forEach(([k,a])=>{const[level,className]=k.split('|'); if(!levels.has(level)) levels.set(level,[]); const enrolled=state.students.filter(s=>s.level===level&&s.className===className).length; levels.get(level).push({className,count:a.length,enrolled,averageMs:avg(a.map(s=>s.elapsedMs))});});
    [...levels.entries()].sort().forEach(([level,a])=>{a.sort((x,y)=>x.averageMs-y.averageMs);a.forEach((x,i)=>classAverages.push({level,rank:i+1,className:x.className,count:x.count,enrolled:x.enrolled,average:fmt(x.averageMs)}));});
    [...classes.entries()].map(([className,a])=>({className,level:a[0]?.level||'',count:a.length,enrolled:state.students.filter(s=>s.className===className).length,averageMs:avg(a.map(s=>s.elapsedMs))})).filter(x=>x.count>0).sort((a,b)=>a.averageMs-b.averageMs).forEach((x,i)=>classOverall.push({rank:i+1,className:x.className,level:x.level,count:x.count,enrolled:x.enrolled,average:fmt(x.averageMs)}));
    const teachers=new Map(); Object.entries(state.classTeachers||{}).forEach(([className,names])=>{ (names||[]).filter(Boolean).forEach(teacher=>{ if(!teachers.has(teacher)) teachers.set(teacher,{classes:new Set(),students:[]}); const obj=teachers.get(teacher); obj.classes.add(className); obj.students.push(...finished.filter(s=>s.className===className)); }); });
    [...teachers.entries()].map(([teacher,obj])=>{ const unique=[...new Map(obj.students.map(s=>[s.id,s])).values()]; const enrolled=state.students.filter(s=>obj.classes.has(s.className)).length; return {teacher,classes:[...obj.classes].sort(),count:unique.length,enrolled,averageMs:avg(unique.map(s=>s.elapsedMs))}; }).filter(x=>x.count>0).sort((a,b)=>a.averageMs-b.averageMs).forEach((x,i)=>teacherAverages.push({rank:i+1,teacher:x.teacher,classes:x.classes,count:x.count,enrolled:x.enrolled,average:fmt(x.averageMs)}));
    return {individual,byRace,byClass,classAverages,classOverall,teacherAverages};
  }

  function exportExcel() {
    const g=rankings(); if(!window.XLSX) return notify('Module Excel indisponible');
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.individual.map(r=>({Niveau:r.level,Sexe:r.sex,Rang:r.rank,Dossard:r.bib,Élève:r.name,Classe:r.className,Temps:r.time}))),'Niveau-Sexe');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.byRace.map(r=>({Course:r.raceName,Rang:r.rank,Dossard:r.bib,Élève:r.name,Classe:r.className,Temps:r.time,'Vitesse moyenne':r.speed}))),'Par course');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.byClass.map(r=>({Classe:r.className,Rang:r.rank,Dossard:r.bib,Élève:r.name,Sexe:r.sex,Temps:r.time}))),'Par classe');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.classAverages.map(r=>({Niveau:r.level,Rang:r.rank,Classe:r.className,Classés:r.count,Inscrits:r.enrolled,'Temps moyen':r.average}))),'Classes par niveau');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.classOverall.map(r=>({Rang:r.rank,Classe:r.className,Niveau:r.level,Classés:r.count,Inscrits:r.enrolled,'Temps moyen':r.average}))),'Classes collège');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.teacherAverages.map(r=>({Rang:r.rank,Professeur:r.teacher,Classes:r.classes.join(', '),'Élèves classés':r.count,'Élèves inscrits':r.enrolled,'Temps moyen':r.average}))),'Professeurs');
    XLSX.writeFile(wb,'resultats-cross.xlsx');
  }

  function pdfTable(doc,title,head,body,first){ if(!first) doc.addPage(); doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text(title,14,18); doc.autoTable({head:[head],body,startY:24,styles:{fontSize:8},headStyles:{fillColor:[15,23,42]}}); }
  function exportResultsPdf() {
    const g=rankings(); if(!window.jspdf?.jsPDF) return notify('Module PDF indisponible');
    const {jsPDF}=window.jspdf, doc=new jsPDF({unit:'mm',format:'a4'});
    if(typeof doc.autoTable !== 'function') return notify('Module tableau PDF indisponible');
    pdfTable(doc,'Classement par niveau et sexe',['Niveau','Sexe','Rang','Dossard','Élève','Classe','Temps'],g.individual.map(r=>[r.level,r.sex,r.rank,r.bib,r.name,r.className,r.time]),true);
    pdfTable(doc,'Classement par course',['Course','Rang','Dossard','Élève','Classe','Temps','Vitesse'],g.byRace.map(r=>[r.raceName,r.rank,r.bib,r.name,r.className,r.time,r.speed]),false);
    pdfTable(doc,'Classement par classe',['Classe','Rang','Dossard','Élève','Sexe','Temps'],g.byClass.map(r=>[r.className,r.rank,r.bib,r.name,r.sex,r.time]),false);
    pdfTable(doc,'Classement des classes par niveau',['Niveau','Rang','Classe','Classés','Inscrits','Temps moyen'],g.classAverages.map(r=>[r.level,r.rank,r.className,r.count,r.enrolled,r.average]),false);
    pdfTable(doc,'Classement des classes du collège',['Rang','Classe','Niveau','Classés','Inscrits','Temps moyen'],g.classOverall.map(r=>[r.rank,r.className,r.level,r.count,r.enrolled,r.average]),false);
    pdfTable(doc,'Classement des professeurs',['Rang','Professeur','Classes','Classés','Inscrits','Temps moyen'],g.teacherAverages.map(r=>[r.rank,r.teacher,r.classes.join(', '),r.count,r.enrolled,r.average]),false);
    doc.save('resultats-cross.pdf');
  }

  function exportRacePdf(raceId) {
    const race=raceOf(raceId); if(!race) return;
    const g=rankings(), rows=g.byRace.filter(r=>r.raceId===raceId);
    if(!window.jspdf?.jsPDF) return notify('Module PDF indisponible');
    const {jsPDF}=window.jspdf, doc=new jsPDF({unit:'mm',format:'a4'});
    if(typeof doc.autoTable !== 'function') return notify('Module tableau PDF indisponible');
    doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text(race.name,14,18);
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.text(`${state.crossDistanceM ? state.crossDistanceM+' m · ' : ''}${rows.length} classés`,14,25);
    doc.autoTable({head:[['Rang','Dossard','Élève','Classe','Temps','Vitesse moy.']],body:rows.map(r=>[r.rank,r.bib,r.name,r.className,r.time,r.speed]),startY:30,styles:{fontSize:9},headStyles:{fillColor:[15,23,42]}});
    doc.save(`resultats-${race.name.toLowerCase().replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'') || 'course'}.pdf`);
  }

  function saveSettings() {
    const distance=Number($('#cross-distance')?.value);
    if(!Number.isFinite(distance) || distance<=0) return notify('Renseigne une distance valide en mètres');
    state.crossDistanceM=Math.round(distance);
    state.notice=`Distance du cross enregistrée : ${state.crossDistanceM} m`;
    save(); render();
  }

  function exportBibs() {
    if(!window.jspdf?.jsPDF || !window.JsBarcode || !window.QRCode) return notify('Module dossards indisponible. Recharge avec Internet.');
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({unit:'mm',format:'a4',orientation:'landscape'});
    const W=297,H=210;
    state.students.forEach((s,i)=>{
      if(i) doc.addPage('a4','landscape');
      doc.setDrawColor(15,23,42); doc.setLineWidth(.8); doc.rect(10,10,W-20,H-20);
      doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text('CROSS DU COLLÈGE',W/2,23,{align:'center'});
      doc.setFontSize(76); doc.text(String(s.bib),W/2,72,{align:'center'});
      doc.setFontSize(22); doc.text(nameOf(s).slice(0,34),W/2,88,{align:'center'});
      doc.setFontSize(16); doc.text(`${s.className} · ${s.level} · ${s.sex}`,W/2,99,{align:'center'});

      const barCanvas=document.createElement('canvas');
      JsBarcode(barCanvas,String(s.bib),{format:'CODE128',displayValue:false,height:78,margin:8,width:2});
      doc.addImage(barCanvas.toDataURL('image/png'),'PNG',26,113,155,42);
      doc.setFontSize(18); doc.text(String(s.bib),103.5,164,{align:'center'});

      const holder=document.createElement('div');
      new QRCode(holder,{text:String(s.bib),width:256,height:256,correctLevel:QRCode.CorrectLevel.H});
      const qrCanvas=holder.querySelector('canvas'), qrImg=holder.querySelector('img');
      const qrData=qrCanvas ? qrCanvas.toDataURL('image/png') : qrImg?.src;
      if(qrData) doc.addImage(qrData,'PNG',218,111,50,50);

      doc.setFont('helvetica','normal'); doc.setFontSize(9);
      doc.text('Code-barres principal · QR code de secours',W/2,185,{align:'center'});
    });
    doc.save('dossards-cross.pdf');
  }

  function downloadTemplate(){ downloadBlob('\uFEFFNom;Prénom;Classe;Niveau;Sexe;Enseignant;Dossard\nDUPONT;Lina;6A;6e;F;Mme Martin;1\nMARTIN;Noé;6A;6e;M;Mme Martin;2\n','modele-eleves-cross.csv','text/csv;charset=utf-8'); }
  function exportBackup(){ downloadBlob(JSON.stringify(state,null,2),'sauvegarde-cross.json','application/json'); }
  function downloadBlob(content,name,type){ const blob=new Blob([content],{type}), a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

  document.addEventListener('keydown', e => {
    if(state.tab !== 'timing' || manualStamp !== null) return;
    const t=e.target; if(t && ['INPUT','TEXTAREA','SELECT'].includes(t.tagName)) return;
    const now=performance.now(); if(now-scanLastKey>250) scanBuffer=''; scanLastKey=now;
    if(e.key==='Enter' || e.key==='Tab'){ const code=scanBuffer.trim(); scanBuffer=''; if(code){e.preventDefault();scan(code);} return; }
    if(e.key.length===1 && !e.metaKey && !e.ctrlKey && !e.altKey) scanBuffer += e.key;
  }, true);

  if('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  render();
})();
