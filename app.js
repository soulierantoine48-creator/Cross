(() => {
  'use strict';

  const STORAGE_KEY = 'cross-college-state-v2';
  const EMPTY = { students: [], races: [], arrivals: [], classTeachers: {}, crossDistanceM: 0, scannerSeen: false, scannerLastAt: 0, tab: 'students', notice: 'Prêt', noticeKind: 'info', lastScan: '', resultRaceId: '', resultMode: 'courses' };
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
  let scanStartedAt = 0;
  let openClass = '';
  let studentEditorId = null;
  let studentSearch = '';
  let syncStatus = navigator.onLine ? 'pending' : 'offline';
  let syncPending = true;
  let syncTimer = null;
  let syncBusy = false;
  const app = document.getElementById('app');
  const $ = s => document.querySelector(s);
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const SUPABASE_URL = 'https://kgqutmjvbqkqcrxbcizj.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_T-r0q95PauaFtoY79RoGpA_bh1EWmcZ';
  const CLOUD_ID_KEY = 'cross-cloud-backup-id';
  const CLOUD_SECRET_KEY = 'cross-cloud-backup-secret';
  const cloudBackupId = localStorage.getItem(CLOUD_ID_KEY) || uid();
  const cloudSecret = localStorage.getItem(CLOUD_SECRET_KEY) || uid();
  localStorage.setItem(CLOUD_ID_KEY, cloudBackupId);
  localStorage.setItem(CLOUD_SECRET_KEY, cloudSecret);
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
  const levelTone = level => ({'6e':'level-6','5e':'level-5','4e':'level-4','3e':'level-3'}[level] || 'level-x');

  function bibIssues() {
    const seen=new Map(), issues=[];
    state.students.forEach(s=>{
      const bib=Number(s.bib);
      if(!Number.isInteger(bib) || bib<=0) issues.push(`${nameOf(s)} : dossard manquant/invalide`);
      else {
        if(seen.has(bib)) issues.push(`Dossard ${bib} en double : ${seen.get(bib)} / ${nameOf(s)}`);
        else seen.set(bib,nameOf(s));
      }
      if(!['F','M'].includes(s.sex)) issues.push(`${nameOf(s)} : sexe non renseigné`);
    });
    return issues;
  }

  function classStats(cls) {
    const a=state.students.filter(s=>s.className===cls);
    return {students:a,total:a.length,girls:a.filter(s=>s.sex==='F').length,boys:a.filter(s=>s.sex==='M').length,level:a[0]?.level||''};
  }

  function currentLastArrival() {
    const a=state.arrivals.at(-1);
    if(!a) return null;
    const s=state.students.find(x=>x.id===a.studentId);
    return s ? {a,s} : null;
  }

  function load() {
    try { return { ...EMPTY, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) }; }
    catch { return { ...EMPTY }; }
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    syncPending = true;
    scheduleCloudSync();
  }

  function notify(msg, kind='info') {
    state.notice = msg;
    state.noticeKind = kind;
    save();
    render();
  }

  function updateSyncBadge() {
    const el=document.getElementById('sync-badge');
    if(!el) return;
    const map={
      synced:['●','Synchronisé','sync-ok'],
      syncing:['↻','Sauvegarde…','sync-working'],
      pending:['↻','À synchroniser','sync-working'],
      offline:['●','Hors ligne · local sécurisé','sync-offline'],
      error:['!','Sauvegarde cloud en attente','sync-error']
    };
    const [icon,label,cls]=map[syncStatus]||map.pending;
    el.className=`sync-badge ${cls}`;
    el.textContent=`${icon} ${label}`;
  }

  function scheduleCloudSync(delay=900) {
    syncPending = true;
    clearTimeout(syncTimer);
    syncTimer=setTimeout(syncCloud,delay);
  }

  async function syncCloud() {
    if(syncBusy || !syncPending) return;
    if(!navigator.onLine){ syncStatus='offline'; updateSyncBadge(); return; }
    syncBusy=true; syncPending=false; syncStatus='syncing'; updateSyncBadge();
    try {
      const response=await fetch(`${SUPABASE_URL}/rest/v1/cross_backups?on_conflict=backup_id`,{
        method:'POST',
        headers:{
          'apikey':SUPABASE_KEY,
          'Content-Type':'application/json',
          'Prefer':'resolution=merge-duplicates,return=minimal',
          'x-cross-secret':cloudSecret
        },
        body:JSON.stringify({backup_id:cloudBackupId,secret_token:cloudSecret,state,updated_at:new Date().toISOString()})
      });
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      syncStatus='synced';
    } catch(e) {
      syncPending=true;
      syncStatus=navigator.onLine?'error':'offline';
    } finally {
      syncBusy=false;
      updateSyncBadge();
      if(syncPending && navigator.onLine) scheduleCloudSync(5000);
    }
  }

  function render() {
    const tabs = [['students','1. Préparation'],['races','2. Courses'],['timing','3. Jour J'],['results','4. Résultats']];
    app.innerHTML = `<div class="app-shell">
      <header class="topbar">
        <div class="brand"><img src="./icon-180.png" alt=""><div><h1>Cross Ada Lovelace</h1><p>${state.students.length} élèves · ${classNames().length} classes · ${state.races.length} courses</p></div></div>
        <div id="sync-badge" class="sync-badge"></div>
      </header>
      <nav class="tabs">${tabs.map(([id,label]) => `<button data-tab="${id}" class="${state.tab===id?'active':''}">${label}</button>`).join('')}</nav>
      <main>${page()}</main>
      ${openClass ? classModal() : ''}
      ${studentEditorId !== null ? studentModal() : ''}
      ${manualStamp !== null ? manualModal() : ''}
    </div>`;
    bind();
    updateSyncBadge();
  }

  function page() {
    if (state.tab === 'students') return studentsPage();
    if (state.tab === 'races') return racesPage();
    if (state.tab === 'timing') return timingPage();
    return resultsPage();
  }

  function studentsPage() {
    const issues=bibIssues();
    const q=studentSearch.trim().toLowerCase();
    const matches=q ? state.students.filter(s => nameOf(s).toLowerCase().includes(q) || String(s.className).toLowerCase().includes(q) || String(s.bib||'').includes(q)).slice(0,40) : [];
    return `<section class="prep-page">
      <div class="hero-card">
        <div><span class="eyebrow">PRÉPARATION</span><h2>Élèves & dossards</h2><p>Importe la liste, contrôle les données puis ouvre chaque classe pour les ajustements.</p></div>
        <div class="actions">
          <label class="button primary file-button">Importer Excel<input id="student-file" type="file" accept=".xlsx,.xls,.csv"></label>
          <button class="button" id="bibs" ${state.students.length?'':'disabled'}>Créer les dossards PDF</button>
          <button class="button subtle" id="backup">Sauvegarde de secours</button>
        </div>
      </div>

      <div class="summary-strip">
        <div><strong>${state.students.length}</strong><span>élèves</span></div>
        <div><strong>${classNames().length}</strong><span>classes</span></div>
        <div class="${issues.length?'summary-alert':'summary-ok'}"><strong>${issues.length}</strong><span>anomalie${issues.length>1?'s':''}</span></div>
      </div>

      ${issues.length ? `<div class="alert-card"><strong>À vérifier avant impression</strong><p>${esc(issues.slice(0,5).join(' · '))}${issues.length>5?' · …':''}</p></div>` : state.students.length ? '<div class="ok-card">✓ Données cohérentes pour les dossards</div>' : ''}

      <div class="search-card">
        <input id="student-search" value="${esc(studentSearch)}" placeholder="Rechercher un élève, une classe ou un dossard">
        ${q ? `<div class="search-results">${matches.length ? matches.map(s=>`<button data-edit-student="${s.id}"><strong>#${esc(s.bib||'—')} · ${esc(nameOf(s))}</strong><span>${esc(s.className)} · ${s.sex==='F'?'Fille':s.sex==='M'?'Garçon':'Sexe ?'}</span></button>`).join('') : '<p class="empty">Aucun élève trouvé.</p>'}</div>` : ''}
      </div>

      <div class="section-head"><div><h3>Classes</h3><p>Une couleur par niveau. Ouvre une classe pour gérer les élèves et son professeur d’EPS référent.</p></div></div>
      <div class="class-grid">
        ${classNames().map(cls=>{
          const x=classStats(cls), teacher=state.classTeachers?.[cls]?.[0]||'Prof EPS à renseigner';
          return `<button class="class-card ${levelTone(x.level)}" data-open-class="${esc(cls)}">
            <span class="class-level">${esc(x.level||'')}</span>
            <strong>${esc(cls)}</strong>
            <span>${x.total} élèves · ${x.girls} F · ${x.boys} G</span>
            <small>${esc(teacher)}</small>
          </button>`;
        }).join('') || '<div class="empty-state">Importe la liste des élèves pour afficher les classes.</div>'}
      </div>
    </section>`;
  }

  function racesPage() {
    const levels = [...new Set(state.students.map(s => s.level).filter(Boolean))].sort();
    return `<section class="courses-page">
      <div class="distance-card">
        <div><span class="eyebrow">PARCOURS</span><h2>Distance unique</h2><p>La même distance sera utilisée pour toutes les courses et les vitesses moyennes.</p></div>
        <div class="distance-input"><input id="cross-distance" type="number" min="100" step="10" inputmode="numeric" value="${state.crossDistanceM || ''}" placeholder="1500"><span>m</span><button class="button primary" id="save-settings">Enregistrer</button></div>
      </div>

      <div class="courses-grid">
        <div class="card clean-card"><span class="eyebrow">CRÉATION MANUELLE</span><h2>Créer une course</h2>
          <label class="field">Nom<input id="race-name" placeholder="Ex. 6e filles"></label>
          <div class="field"><span>Niveau</span><div class="chip-row">${levels.map(l => `<button class="chip" data-level="${esc(l)}">${esc(l)}</button>`).join('')}</div></div>
          <div class="field"><span>Sexe</span><div class="chip-row"><button class="chip" data-sex="F">Filles</button><button class="chip" data-sex="M">Garçons</button><button class="chip" data-sex="X">Non renseigné</button></div></div>
          <div class="race-preview"><strong id="race-count">0</strong><span>élève sélectionné</span></div>
          <button class="button primary full" id="create-race">Créer la course</button>
        </div>

        <div class="card clean-card"><div class="section-head"><div><span class="eyebrow">COURSES</span><h2>${state.races.length} créée${state.races.length>1?'s':''}</h2></div></div>
          <div class="race-list">${state.races.length ? state.races.map(r => {
            const runners=state.students.filter(s=>s.raceId===r.id), done=runners.filter(s=>s.elapsedMs!=null).length;
            const status=!r.startedAt?'À démarrer':r.endedAt?'Terminée':'En cours';
            return `<div class="race-row"><div><strong>${esc(r.name)}</strong><span>${runners.length} élèves · ${r.levels.map(esc).join(', ')} · ${r.sexes.join('/')}</span><small class="race-status ${r.endedAt?'done':r.startedAt?'live':''}">${status}${r.startedAt?` · ${done}/${runners.length} arrivés`:''}</small></div>
              <div class="race-actions">${!r.startedAt?`<button class="button danger-ghost" data-delete="${r.id}">Supprimer</button>`:''}</div></div>`;
          }).join('') : '<p class="empty">Aucune course créée.</p>'}</div>
        </div>
      </div>
    </section>`;
  }

  function timingPage() {
    const upcoming=state.races.filter(r=>!r.startedAt);
    const active=state.races.filter(r=>r.startedAt && !r.endedAt);
    const ended=state.races.filter(r=>r.endedAt);
    const pending=active.reduce((n,r)=>n+state.students.filter(s=>s.raceId===r.id&&s.elapsedMs==null).length,0);
    const done=state.students.filter(s=>s.elapsedMs!=null).length;
    const last=currentLastArrival();
    return `<section class="day-page">
      <div class="day-statusbar">
        <span class="status-chip ${state.scannerSeen?'ok':''}">${state.scannerSeen?'● Scanner prêt':'○ Scanner non testé'}</span>
        <span class="status-chip">Parcours · ${state.crossDistanceM ? state.crossDistanceM+' m' : 'distance à régler'}</span>
        <span class="status-chip">${active.length} course${active.length>1?'s':''} en cours</span>
      </div>

      <div class="day-layout">
        <div class="day-main">
          <div class="scan-feedback ${esc(state.noticeKind||'info')}">
            <span class="eyebrow">ARRIVÉE</span>
            <strong>${esc(state.notice||'Prêt à scanner')}</strong>
          </div>

          <div class="day-stats"><div><strong>${pending}</strong><span>encore en course</span></div><div><strong>${done}</strong><span>arrivées enregistrées</span></div><div><strong>${active.length}</strong><span>courses actives</span></div></div>

          <div class="day-actions">
            <button class="button no-bib-button" id="no-bib" ${active.length?'':'disabled'}>SANS DOSSARD</button>
            <button class="button undo-button" id="undo" ${last?'':'disabled'}>${last?`Annuler #${last.s.bib} · ${esc(nameOf(last.s))} · ${fmt(last.a.elapsedMs)}`:'Aucune arrivée à annuler'}</button>
          </div>

          <div class="recent-arrivals"><div class="section-head"><h3>Dernières arrivées</h3><button class="text-button" id="test-scan">Tester le scanner</button></div>
            ${state.arrivals.slice(-10).reverse().map(a=>{const s=state.students.find(x=>x.id===a.studentId);return s?`<div class="recent-arrival"><strong>#${s.bib} ${esc(nameOf(s))}</strong><span>${fmt(a.elapsedMs)} · ${esc(raceOf(a.raceId)?.name||'')}</span></div>`:'';}).join('') || '<p class="empty">Aucune arrivée enregistrée.</p>'}
          </div>
        </div>

        <aside class="day-side">
          <div class="day-panel"><div class="section-head"><div><span class="eyebrow">DÉPARTS</span><h3>Courses à venir</h3></div></div>
            <div class="race-list">${upcoming.length ? upcoming.map(r=>{const n=state.students.filter(s=>s.raceId===r.id).length;return `<div class="start-card"><div><strong>${esc(r.name)}</strong><span>${n} élèves</span></div><button class="start-now" data-start="${r.id}">DÉPART</button></div>`;}).join('') : '<p class="empty">Toutes les courses ont été lancées.</p>'}</div>
          </div>

          <div class="day-panel"><div class="section-head"><div><span class="eyebrow">EN COURS</span><h3>Courses actives</h3></div></div>
            <div class="race-list">${active.length ? active.map(r=>{const a=state.students.filter(s=>s.raceId===r.id), d=a.filter(s=>s.elapsedMs!=null).length;return `<div class="active-card"><div><strong>${esc(r.name)}</strong><span>Départ ${new Date(r.startedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span><b>${d}/${a.length} arrivés</b></div><button class="finish-now" data-finish-race="${r.id}">TERMINER</button></div>`;}).join('') : '<p class="empty">Aucune course en cours.</p>'}</div>
          </div>

          ${ended.length ? `<div class="day-panel compact-panel"><div class="section-head"><div><span class="eyebrow">TERMINÉES</span></div></div>${ended.slice(-4).reverse().map(r=>`<div class="ended-row"><span>${esc(r.name)}</span><button class="text-button" data-reopen="${r.id}">Réouvrir</button></div>`).join('')}</div>` : ''}
        </aside>
      </div>
    </section>`;
  }

  function resultsPage() {
    const g=rankings(), done=state.students.filter(s=>s.elapsedMs!=null).length;
    const ended=state.races.filter(r=>r.endedAt);
    const mode=state.resultMode||'courses';
    const selectedRaceId=state.resultRaceId && ended.some(r=>r.id===state.resultRaceId) ? state.resultRaceId : (ended[0]?.id||'');
    const selectedRace=raceOf(selectedRaceId);
    const raceRows=g.byRace.filter(r=>r.raceId===selectedRaceId);

    let content='';
    if(mode==='courses'){
      content=`<div class="results-split"><div class="results-list">${ended.map(r=>{const rr=state.students.filter(s=>s.raceId===r.id), n=rr.filter(s=>s.elapsedMs!=null).length;return `<button class="result-course ${r.id===selectedRaceId?'selected':''}" data-view-race="${r.id}"><strong>${esc(r.name)}</strong><span>${n}/${rr.length} classés</span></button>`;}).join('')||'<p class="empty">Aucune course terminée.</p>'}</div>
        <div class="card table-card results-main" id="race-results-panel">${selectedRace?`<div class="card-head"><div><h3>${esc(selectedRace.name)}</h3><p>${raceRows.length} classés</p></div><button class="button" data-export-race="${selectedRace.id}">Exporter PDF</button></div>${raceRows.length?`<table><thead><tr><th>Rang</th><th>Dossard</th><th>Élève</th><th>Classe</th><th>Temps</th><th>Vitesse</th></tr></thead><tbody>${raceRows.map(r=>`<tr><td><b>${r.rank}</b></td><td>#${r.bib}</td><td>${esc(r.name)}</td><td>${esc(r.className)}</td><td><b>${r.time}</b></td><td>${r.speed}</td></tr>`).join('')}</tbody></table>`:'<p class="empty">Aucune arrivée.</p>'}`:'<p class="empty">Sélectionne une course.</p>'}</div></div>`;
    } else if(mode==='individual'){
      content=`<div class="card table-card"><table><thead><tr><th>Niveau</th><th>Sexe</th><th>Rang</th><th>Dossard</th><th>Élève</th><th>Classe</th><th>Temps</th></tr></thead><tbody>${g.individual.map(r=>`<tr><td>${esc(r.level)}</td><td>${esc(r.sex)}</td><td><b>${r.rank}</b></td><td>#${r.bib}</td><td>${esc(r.name)}</td><td>${esc(r.className)}</td><td><b>${r.time}</b></td></tr>`).join('')}</tbody></table></div>`;
    } else if(mode==='classes'){
      content=`<div class="results-two"><div class="card table-card"><h3>Classes par niveau</h3><table><thead><tr><th>Niveau</th><th>Rang</th><th>Classe</th><th>Classés</th><th>Temps moyen</th></tr></thead><tbody>${g.classAverages.map(r=>`<tr><td>${esc(r.level)}</td><td><b>${r.rank}</b></td><td>${esc(r.className)}</td><td>${r.count}/${r.enrolled}</td><td><b>${r.average}</b></td></tr>`).join('')}</tbody></table></div><div class="card table-card"><h3>Collège</h3><table><thead><tr><th>Rang</th><th>Classe</th><th>Niveau</th><th>Classés</th><th>Temps moyen</th></tr></thead><tbody>${g.classOverall.map(r=>`<tr><td><b>${r.rank}</b></td><td>${esc(r.className)}</td><td>${esc(r.level)}</td><td>${r.count}/${r.enrolled}</td><td><b>${r.average}</b></td></tr>`).join('')}</tbody></table></div></div>`;
    } else {
      content=`<div class="card table-card"><table><thead><tr><th>Rang</th><th>Professeur EPS</th><th>Classes</th><th>Classés</th><th>Temps moyen</th></tr></thead><tbody>${g.teacherAverages.map(r=>`<tr><td><b>${r.rank}</b></td><td>${esc(r.teacher)}</td><td>${esc(r.classes.join(', '))}</td><td>${r.count}/${r.enrolled}</td><td><b>${r.average}</b></td></tr>`).join('')||'<tr><td colspan="5">Aucun professeur EPS renseigné.</td></tr>'}</tbody></table></div>`;
    }

    return `<section class="results-page">
      <div class="hero-card results-hero"><div><span class="eyebrow">RÉSULTATS</span><h2>${done} élèves classés</h2><p>${ended.length} course${ended.length>1?'s':''} terminée${ended.length>1?'s':''}</p></div><div class="actions"><button class="button" id="export-excel" ${done?'':'disabled'}>Excel</button><button class="button primary" id="export-all-results" ${done?'':'disabled'}>PDF complet</button></div></div>
      <div class="result-tabs"><button data-result-mode="courses" class="${mode==='courses'?'active':''}">Courses</button><button data-result-mode="individual" class="${mode==='individual'?'active':''}">Individuels</button><button data-result-mode="classes" class="${mode==='classes'?'active':''}">Classes</button><button data-result-mode="teachers" class="${mode==='teachers'?'active':''}">Professeurs</button></div>
      ${content}
    </section>`;
  }

  function classModal() {
    const cls=openClass, x=classStats(cls), teacher=state.classTeachers?.[cls]?.[0]||'';
    return `<div class="modal-backdrop sheet-backdrop"><div class="modal class-modal"><div class="modal-head"><div><span class="eyebrow">${esc(x.level)}</span><h2>${esc(cls)}</h2><p>${x.total} élèves · ${x.girls} filles · ${x.boys} garçons</p></div><button class="close" id="close-class">×</button></div>
      <div class="teacher-box"><label>Professeur d’EPS référent<input id="class-teacher" value="${esc(teacher)}" placeholder="Nom du professeur"></label><button class="button" id="save-class-teacher">Enregistrer</button></div>
      <div class="class-actions"><button class="button primary" id="add-student">+ Ajouter un élève</button></div>
      <div class="class-students">${x.students.sort((a,b)=>nameOf(a).localeCompare(nameOf(b),'fr')).map(s=>`<button data-edit-student="${s.id}"><span class="student-bib">#${esc(s.bib||'—')}</span><strong>${esc(nameOf(s))}</strong><span>${s.sex==='F'?'Fille':s.sex==='M'?'Garçon':'Sexe ?'}</span><small>Modifier</small></button>`).join('')}</div>
    </div></div>`;
  }

  function studentModal() {
    const isNew=studentEditorId==='new';
    const s=isNew?{lastName:'',firstName:'',className:openClass||'',sex:'M',bib:''}:state.students.find(x=>x.id===studentEditorId);
    if(!s) return '';
    return `<div class="modal-backdrop editor-backdrop"><div class="modal student-modal"><div class="modal-head"><div><span class="eyebrow">${isNew?'NOUVEL ÉLÈVE':'MODIFIER'}</span><h2>${isNew?'Ajouter un élève':esc(nameOf(s))}</h2></div><button class="close" id="close-student">×</button></div>
      <div class="form-grid"><label>Nom<input id="student-last" value="${esc(s.lastName)}"></label><label>Prénom<input id="student-first" value="${esc(s.firstName)}"></label><label>Classe<input id="student-class" value="${esc(s.className)}"></label><label>Sexe<select id="student-sex"><option value="F" ${s.sex==='F'?'selected':''}>Fille</option><option value="M" ${s.sex==='M'?'selected':''}>Garçon</option><option value="X" ${s.sex==='X'?'selected':''}>Non renseigné</option></select></label><label>Dossard<input id="student-bib" type="number" inputmode="numeric" value="${esc(s.bib||'')}"></label></div>
      <button class="button primary full" id="save-student">${isNew?'Ajouter':'Enregistrer'}</button>
    </div></div>`;
  }

  function manualModal() {
    const q=manualQuery.trim().toLowerCase();
    const candidates=state.students.filter(s=>s.elapsedMs==null&&s.raceId&&raceOf(s.raceId)?.startedAt&&!raceOf(s.raceId)?.endedAt&&(!q||String(s.bib||'').includes(q)||nameOf(s).toLowerCase().includes(q)||String(s.className).toLowerCase().includes(q))).slice(0,30);
    return `<div class="modal-backdrop manual-backdrop"><div class="modal manual-modal"><div class="modal-head"><div><span class="eyebrow">TEMPS FIGÉ</span><h2>Sans dossard</h2><p>${new Date(manualStamp).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} · le scanner reste actif en arrière-plan</p></div><button class="close" id="close-modal">×</button></div>
      <input class="manual-search" id="manual-search" value="${esc(manualQuery)}" placeholder="Nom, classe ou dossard">
      <div class="candidate-list">${candidates.map(s=>`<button data-manual="${s.id}"><strong>#${esc(s.bib||'—')}</strong><span>${esc(nameOf(s))} · ${esc(s.className)}</span><small>${esc(raceOf(s.raceId)?.name||'')}</small></button>`).join('')||'<p class="empty">Tape un nom ou une classe.</p>'}</div>
    </div></div>`;
  }

  function bind() {
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;save();render();});
    $('#student-file')?.addEventListener('change',e=>importStudents(e.target.files?.[0]));
    $('#bibs')?.addEventListener('click',exportBibs);
    $('#backup')?.addEventListener('click',exportBackup);
    $('#student-search')?.addEventListener('input',e=>{studentSearch=e.target.value;render();setTimeout(()=>{const x=$('#student-search');if(x){x.focus();x.setSelectionRange(x.value.length,x.value.length);}},0);});
    document.querySelectorAll('[data-open-class]').forEach(b=>b.onclick=()=>{openClass=b.dataset.openClass;render();});
    $('#close-class')?.addEventListener('click',()=>{openClass='';render();});
    $('#save-class-teacher')?.addEventListener('click',()=>saveClassTeachers(openClass));
    $('#add-student')?.addEventListener('click',()=>{studentEditorId='new';render();});
    document.querySelectorAll('[data-edit-student]').forEach(b=>b.onclick=()=>{studentEditorId=b.dataset.editStudent;render();});
    $('#close-student')?.addEventListener('click',()=>{studentEditorId=null;render();});
    $('#save-student')?.addEventListener('click',saveStudentEditor);

    document.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{b.classList.toggle('selected');updateRaceCount();});
    $('#create-race')?.addEventListener('click',createRace);
    document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteRace(b.dataset.delete));
    document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>startRace(b.dataset.start));
    document.querySelectorAll('[data-finish-race]').forEach(b=>b.onclick=()=>finishRace(b.dataset.finishRace));
    document.querySelectorAll('[data-reopen]').forEach(b=>b.onclick=()=>reopenRace(b.dataset.reopen));
    $('#save-settings')?.addEventListener('click',saveSettings);

    $('#no-bib')?.addEventListener('click',()=>{manualStamp=Date.now();manualQuery='';state.notice='Temps sans dossard figé';state.noticeKind='warning';save();render();});
    $('#close-modal')?.addEventListener('click',closeManual);
    $('#manual-search')?.addEventListener('input',e=>{manualQuery=e.target.value;render();setTimeout(()=>{const x=$('#manual-search');if(x){x.focus();x.setSelectionRange(x.value.length,x.value.length);}},0);});
    document.querySelectorAll('[data-manual]').forEach(b=>b.onclick=()=>manualFinish(b.dataset.manual));
    $('#undo')?.addEventListener('click',undoLast);
    $('#test-scan')?.addEventListener('click',()=>notify('Mode test : scanne un dossard maintenant.','info'));

    document.querySelectorAll('[data-result-mode]').forEach(b=>b.onclick=()=>{state.resultMode=b.dataset.resultMode;save();render();});
    $('#export-all-results')?.addEventListener('click',exportResultsPdf);
    $('#export-excel')?.addEventListener('click',exportExcel);
    document.querySelectorAll('[data-view-race]').forEach(b=>b.onclick=()=>{state.resultRaceId=b.dataset.viewRace;save();render();});
    document.querySelectorAll('[data-export-race]').forEach(b=>b.onclick=()=>exportRacePdf(b.dataset.exportRace));

    updateRaceCount();
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

  function fitPdfText(doc,text,maxWidth,maxSize,minSize,font='helvetica',style='bold') {
    doc.setFont(font,style);
    let size=maxSize;
    while(size>minSize){
      doc.setFontSize(size);
      if(doc.getTextWidth(text)<=maxWidth) return size;
      size-=0.5;
    }
    doc.setFontSize(minSize);
    return minSize;
  }

  let bibBackgroundDataCache = '';

  function parseB36(v) {
    const n=parseInt(v,36);
    return Number.isFinite(n) ? n : 0;
  }

  function buildBibBackgroundData() {
    if(bibBackgroundDataCache) return bibBackgroundDataCache;
    const raw=(window.BIB_VECTOR_PARTS||[]).join(';');
    if(!raw) throw new Error('Fond haute définition du dossard indisponible');

    const canvas=document.createElement('canvas');
    canvas.width=3508;
    canvas.height=2480;
    const ctx=canvas.getContext('2d');
    if(!ctx) throw new Error('Impossible de préparer le fond du dossard');

    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    const sx=canvas.width/1512;
    const sy=canvas.height/1040;

    const shapes=raw.split(';').filter(Boolean).map(item=>{
      const cut=item.indexOf(':');
      const depth=parseB36(item.slice(0,cut));
      const pts=item.slice(cut+1).split(',');
      let [x,y]=pts[0].split('.').map(parseB36);
      const out=[[x,y]];
      for(let i=1;i<pts.length;i++){
        const [dx,dy]=pts[i].split('.').map(parseB36);
        x+=dx; y+=dy; out.push([x,y]);
      }
      return {depth,pts:out};
    }).sort((a,b)=>a.depth-b.depth);

    ctx.imageSmoothingEnabled=false;
    for(const shape of shapes){
      if(shape.pts.length<3) continue;
      ctx.beginPath();
      ctx.moveTo(shape.pts[0][0]*sx,shape.pts[0][1]*sy);
      for(let i=1;i<shape.pts.length;i++) ctx.lineTo(shape.pts[i][0]*sx,shape.pts[i][1]*sy);
      ctx.closePath();
      ctx.fillStyle=shape.depth%2 ? '#fff' : '#000';
      ctx.fill();
    }

    bibBackgroundDataCache=canvas.toDataURL('image/png');
    return bibBackgroundDataCache;
  }

  function drawVectorBarcode(doc,value,x,y,w,h) {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    JsBarcode(svg,String(value),{
      format:'CODE128',
      displayValue:false,
      height:100,
      margin:12,
      width:3,
      background:'#ffffff',
      lineColor:'#000000'
    });

    const view=(svg.getAttribute('viewBox')||'').trim().split(/\s+/).map(Number);
    const sourceW=(view.length===4 && view[2]) || parseFloat(svg.getAttribute('width')) || 1;
    const sourceH=(view.length===4 && view[3]) || parseFloat(svg.getAttribute('height')) || 1;

    doc.setFillColor(255,255,255);
    doc.rect(x-6,y-2,w+12,h+4,'F');
    doc.setFillColor(0,0,0);

    svg.querySelectorAll('rect').forEach(rect=>{
      const rw=parseFloat(rect.getAttribute('width'))||0;
      const rh=parseFloat(rect.getAttribute('height'))||0;
      if(!rw || !rh || (rw>=sourceW*.9 && rh>=sourceH*.9)) return;

      let tx=0,ty=0;
      const transform=rect.parentElement?.getAttribute('transform')||'';
      const m=transform.match(/translate\(\s*([-+\d.]+)(?:[,\s]+([-+\d.]+))?\s*\)/);
      if(m){ tx=Number(m[1])||0; ty=Number(m[2])||0; }

      const rx=(parseFloat(rect.getAttribute('x'))||0)+tx;
      const ry=(parseFloat(rect.getAttribute('y'))||0)+ty;
      doc.rect(
        x+(rx/sourceW)*w,
        y+(ry/sourceH)*h,
        (rw/sourceW)*w,
        (rh/sourceH)*h,
        'F'
      );
    });
  }

  function drawStudentName(doc,s,centerX) {
    const first=String(s.firstName||'').trim();
    const last=String(s.lastName||'').trim().toUpperCase();
    const full=`${first} ${last}`.trim();
    const safeWidth=114;

    // Cas normal : nom bien présent, avec une taille généreuse.
    const oneLineSize=fitPdfText(doc,full,safeWidth,34,18,'helvetica','bold');
    doc.setFont('helvetica','bold');
    doc.setFontSize(oneLineSize);

    if(doc.getTextWidth(full)<=safeWidth){
      doc.text(full,centerX,148,{align:'center'});
      return 157;
    }

    // Cas exceptionnel : on sépare prénom et nom pour ne jamais toucher les côtés.
    const firstSize=fitPdfText(doc,first,safeWidth,24,15,'helvetica','bold');
    doc.setFontSize(firstSize);
    doc.text(first,centerX,142,{align:'center'});

    const lastSize=fitPdfText(doc,last,safeWidth,28,13,'helvetica','bold');
    doc.setFontSize(lastSize);
    doc.text(last,centerX,151,{align:'center'});
    return 159;
  }

  async function exportBibs() {
    if(!window.jspdf?.jsPDF || !window.JsBarcode || !window.QRCode) return notify('Module dossards indisponible. Recharge avec Internet.');

    let backgroundData;
    try { backgroundData=buildBibBackgroundData(); }
    catch(e){ return notify(e.message || 'Fond haute définition du dossard indisponible'); }

    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({unit:'mm',format:'a4',orientation:'landscape'});
    const W=297,H=210,centerX=W/2;

    state.students.forEach((s,i)=>{
      if(i) doc.addPage('a4','landscape');

      // Fond reconstruit à 300 dpi depuis les tracés noir/blanc et réutilisé sur toutes les pages.
      doc.addImage(backgroundData,'PNG',0,0,W,H,'bibBackgroundHD','FAST');

      // Code 128 entièrement vectoriel : aucune pixellisation, même en zoomant ou à l'impression.
      drawVectorBarcode(doc,String(s.bib),98,58,101,17);

      // Numéro : beaucoup plus dominant, avec adaptation automatique si 4 chiffres ou plus.
      const bib=String(s.bib);
      const bibSize=fitPdfText(doc,bib,112,150,82,'helvetica','bold');
      doc.setFont('helvetica','bold');
      doc.setFontSize(bibSize);
      doc.text(bib,centerX,132,{align:'center'});

      // Nom/prénom : taille forte pour les noms usuels, réduction automatique sinon.
      const classY=drawStudentName(doc,s,centerX);

      // Classe : secondaire, mais lisible.
      doc.setFont('helvetica','bold');
      doc.setFontSize(11.5);
      doc.text(String(s.className||''),centerX,classY,{align:'center'});

      // QR : centré en bas, assez grand pour être lu de près.
      doc.setFillColor(255,255,255);
      doc.rect(126,160,45,44,'F');
      const holder=document.createElement('div');
      new QRCode(holder,{
        text:String(s.bib),
        width:1024,
        height:1024,
        correctLevel:QRCode.CorrectLevel.H
      });
      const qrCanvas=holder.querySelector('canvas'), qrImg=holder.querySelector('img');
      const qrData=qrCanvas ? qrCanvas.toDataURL('image/png') : qrImg?.src;
      if(qrData) doc.addImage(qrData,'PNG',130,164,37,37,undefined,'NONE');
    });

    doc.save('dossards-cross-ada-lovelace-2026.pdf');
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
