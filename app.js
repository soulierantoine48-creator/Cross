(() => {
  'use strict';

  const STORAGE_KEY = 'cross-college-state-v2';
  const EMPTY = { students: [], races: [], arrivals: [], classTeachers: {}, crossDistanceM: 0, scannerSeen: false, scannerLastAt: 0, tab: 'students', notice: 'Prêt', noticeKind: 'info', lastScan: '', resultRaceId: '', resultMode: 'courses', manualPending: [] };
  const EPS_TEACHERS = ['Libourel','Soulier','Sabardeil','Ichou','Gourdon'];
  const DEMO = [
    [101,'DUPONT','Lina','6A','6e','F','Mme Martin'], [102,'MARTIN','Noé','6A','6e','M','Mme Martin'],
    [103,'BERNARD','Inès','6B','6e','F','M. Robert'], [104,'PETIT','Lucas','6B','6e','M','M. Robert'],
    [105,'MOREAU','Emma','5A','5e','F','Mme Garcia'], [106,'RICHARD','Jules','5A','5e','M','Mme Garcia'],
    [107,'DURAND','Chloé','5B','5e','F','M. Lopez'], [108,'SIMON','Hugo','5B','5e','M','M. Lopez'],
    [109,'LAURENT','Sarah','4A','4e','F','Mme Bernard'], [110,'MICHEL','Nathan','4A','4e','M','Mme Bernard'],
    [111,'GARCIA','Léa','3A','3e','F','M. Petit'], [112,'ROUX','Tom','3A','3e','M','M. Petit']
  ];

  let state = load();
  const BAD_IMPORT_FIX_KEY = 'cross-bad-bib-import-cleared-v1';
  clearBrokenBibImportOnce();
  let manualStamp = Array.isArray(state.manualPending) && state.manualPending.length ? state.manualPending[0] : null;
  let manualQuery = '';
  let scanBuffer = '';
  let scanLastKey = 0;
  let scanStartedAt = 0;
  let armedRaceId = '';
  let manualSearchTimer = null;
  let finishConfirmRaceId = '';
  let resultEditStudentId = '';
  let deleteFinishedRaceId = '';
  let openClass = '';
  let studentEditorId = null;
  let studentSearch = '';
  let syncStatus = navigator.onLine ? 'pending' : 'offline';
  let syncPending = true;
  let syncTimer = null;
  let syncBusy = false;
  let raceClockTimer = null;
  let scannerTestMode = false;
  const app = document.getElementById('app');
  const $ = s => document.querySelector(s);
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const SUPABASE_URL = 'https://kgqutmjvbqkqcrxbcizj.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtncXV0bWp2YnFrcWNyeGJjaXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MjY1NTUsImV4cCI6MjEwMzUwMjU1NX0.lmN-ZS4FGXTqjKbm-E2wIcApJk9fsKNAtF8Lnh9MZJM';
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
  const fmtRaceClock = ms => {
    const total=Math.max(0,Math.floor(ms/1000));
    const hours=Math.floor(total/3600);
    const minutes=Math.floor((total%3600)/60);
    const seconds=total%60;
    return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}` : `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  };
  const classNames = () => [...new Set(state.students.map(s => s.className).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
  const levelTone = level => ({'6e':'level-6','5e':'level-5','4e':'level-4','3e':'level-3'}[level] || 'level-x');
  const anyRaceStarted = () => state.races.some(r=>r.startedAt);
  const sexLabel = sex => ({F:'Filles',M:'Garçons',X:'Non renseigné'}[sex] || sex || '');

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

  function clearBrokenBibImportOnce() {
    if(localStorage.getItem(BAD_IMPORT_FIX_KEY)==='1') return;
    const students=Array.isArray(state.students)?state.students:[];
    const allBibsMissing=students.length>0 && students.every(s=>{
      const bib=Number(s.bib);
      return !Number.isInteger(bib) || bib<=0;
    });
    const noRaceData=!(state.races?.length) && !(state.arrivals?.length);
    if(allBibsMissing && noRaceData){
      const distance=Number(state.crossDistanceM)||0;
      state={...EMPTY,crossDistanceM:distance,notice:'Ancien import supprimé · réimporte le fichier avec les N° Dossard',noticeKind:'good'};
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    }
    localStorage.setItem(BAD_IMPORT_FIX_KEY,'1');
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
      synced:['●','Sauvegarde cloud OK','sync-ok'],
      syncing:['↻','Sauvegarde cloud…','sync-working'],
      pending:['↻','Sauvegarde cloud en attente','sync-working'],
      offline:['●','Hors ligne · données locales OK','sync-offline'],
      error:['!','Cloud en attente · données locales OK','sync-error']
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
          'Authorization':`Bearer ${SUPABASE_KEY}`,
          'Content-Type':'application/json',
          'Prefer':'resolution=merge-duplicates,return=minimal',
          'X-Client-Info':`cross/${cloudSecret}`
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
        <div class="brand"><img src="./icon-180.png?v=20" alt="Logo CROSS"><div><span class="brand-kicker">COLLÈGE ADA LOVELACE · NÎMES</span><h1>CROSS 2026</h1><p>${state.students.length} élèves · ${classNames().length} classes · ${state.races.length} courses</p></div></div>
        <div id="sync-badge" class="sync-badge"></div>
      </header>
      <nav class="tabs">${tabs.map(([id,label]) => `<button data-tab="${id}" class="${state.tab===id?'active':''}">${label}</button>`).join('')}</nav>
      <main>${page()}</main>
      ${openClass ? classModal() : ''}
      ${studentEditorId !== null ? studentModal() : ''}
      ${manualStamp !== null ? manualModal() : ''}
      ${finishConfirmRaceId ? finishRaceModal() : ''}
      ${resultEditStudentId ? resultEditModal() : ''}
      ${deleteFinishedRaceId ? deleteFinishedRaceModal() : ''}
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
          <label class="button primary file-button ${anyRaceStarted()?'disabled':''}" title="${anyRaceStarted()?'Import verrouillé après le premier départ':''}">${anyRaceStarted()?'Import verrouillé':'Importer Excel'}<input id="student-file" type="file" accept=".xlsx,.xls,.csv" ${anyRaceStarted()?'disabled':''}></label>
          <button class="button" id="bibs" ${state.students.length?'':'disabled'}>Créer les dossards PDF</button>
          <button class="button subtle" id="backup">Sauvegarde de secours</button>
          <label class="button subtle file-button">Restaurer<input id="backup-file" type="file" accept=".json,application/json"></label>
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
        <div class="distance-input"><input id="cross-distance" type="number" min="100" step="10" inputmode="numeric" value="${state.crossDistanceM || ''}" placeholder="1500" ${anyRaceStarted()?'disabled':''}><span>m</span><button class="button primary" id="save-settings" ${anyRaceStarted()?'disabled':''}>${anyRaceStarted()?'Verrouillée':'Enregistrer'}</button></div>
      </div>

      <div class="courses-grid">
        <div class="card clean-card"><span class="eyebrow">CRÉATION MANUELLE</span><h2>Créer une course</h2>
          <div class="field"><span>Niveau</span><div class="chip-row">${levels.map(l => `<button class="chip" data-level="${esc(l)}">${esc(l)}</button>`).join('')}</div></div>
          <div class="field"><span>Sexe</span><div class="chip-row"><button class="chip" data-sex="F">Filles</button><button class="chip" data-sex="M">Garçons</button><button class="chip" data-sex="X">Non renseigné</button></div></div>
          <div class="race-preview"><span>Nom automatique</span><strong id="race-name-preview">Sélectionne un niveau et un sexe</strong></div>
          <div class="race-preview"><strong id="race-count">0</strong><span>élève sélectionné</span></div>
          <button class="button primary full" id="create-race">Créer la course</button>
        </div>

        <div class="card clean-card"><div class="section-head"><div><span class="eyebrow">COURSES</span><h2>${state.races.length} créée${state.races.length>1?'s':''}</h2></div></div>
          <div class="race-list">${state.races.length ? state.races.map(r => {
            const runners=state.students.filter(s=>s.raceId===r.id), done=runners.filter(s=>s.elapsedMs!=null).length;
            const status=!r.startedAt?'À démarrer':r.endedAt?'Terminée':'En cours';
            return `<div class="race-row"><div><strong>${esc(r.name)}</strong><span>${runners.length} élèves · ${r.levels.map(esc).join(', ')} · ${r.sexes.map(sexLabel).join('/')}</span><small class="race-status ${r.endedAt?'done':r.startedAt?'live':''}">${status}${r.startedAt?` · ${done}/${runners.length} arrivés`:''}</small></div>
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
    const armed=upcoming.find(r=>r.id===armedRaceId)||null;
    if(armedRaceId && !armed) armedRaceId='';

    return `<section class="day-page">
      <div class="day-statusbar">
        <span class="status-chip ${state.scannerSeen?'ok':''}">${state.scannerSeen?'● Scanner testé':'○ Scanner non testé'}</span>
        <span class="status-chip">Parcours · ${state.crossDistanceM ? state.crossDistanceM+' m' : 'distance à régler'}</span>
        <span class="status-chip">${active.length} course${active.length>1?'s':''} en cours</span>
      </div>

      <div class="start-command">
        <div class="start-command-copy"><span class="eyebrow">DÉPART</span><h2>${armed?esc(armed.name):upcoming.length?'Préparer la prochaine course':'Tous les départs sont lancés'}</h2><p>${armed?'Au signal, un seul appui enregistre l’heure exacte du départ.':upcoming.length?'Choisis d’abord la course. Tu peux le faire pendant qu’une autre course est déjà en cours.':'La zone arrivée est maintenant prioritaire.'}</p></div>
        ${armed ? `<div class="armed-actions"><button class="launch-race" id="launch-armed"><span>DÉPART</span><strong>${esc(armed.name)}</strong></button><button class="text-button" id="cancel-armed">Changer</button></div>`
        : upcoming.length ? `<div class="prepare-races">${upcoming.map(r=>{const n=state.students.filter(s=>s.raceId===r.id).length;return `<button data-arm-race="${r.id}"><strong>${esc(r.name)}</strong><span>${n} élèves</span><em>Préparer</em></button>`;}).join('')}</div>`
        : '<div class="all-started"><strong>✓ Départs terminés</strong><span>Aucune course à préparer.</span></div>'}
      </div>

      <div class="day-layout">
        <div class="day-main">
          <div class="scan-feedback ${esc(state.noticeKind||'info')}">
            <span class="eyebrow">ARRIVÉE</span>
            <strong>${esc(state.notice||'Prêt à scanner')}</strong>
          </div>

          <div class="day-stats"><div><strong>${pending}</strong><span>encore en course</span></div><div><strong>${done}</strong><span>arrivées enregistrées</span></div><div><strong>${active.length}</strong><span>courses actives</span></div></div>

          <div class="day-actions">
            <button class="button no-bib-button" id="no-bib" ${active.length?'':'disabled'}>${state.manualPending?.length?'REPRENDRE SANS DOSSARD · '+state.manualPending.length:'SANS DOSSARD'}</button>
            <button class="button undo-button" id="undo" ${last?'':'disabled'}>${last?`Annuler #${last.s.bib} · ${esc(nameOf(last.s))} · ${fmt(last.a.elapsedMs)}`:'Aucune arrivée à annuler'}</button>
          </div>

          <div class="recent-arrivals"><div class="section-head"><h3>Dernières arrivées</h3><button class="text-button ${scannerTestMode?'test-active':''}" id="test-scan">${scannerTestMode?'Test en attente…':'Tester le scanner'}</button></div>
            ${state.arrivals.slice(-10).reverse().map(a=>{const s=state.students.find(x=>x.id===a.studentId);return s?`<div class="recent-arrival"><div><strong>#${s.bib} ${esc(nameOf(s))}</strong><small>${esc(s.className)} · ${esc(raceOf(a.raceId)?.name||'')}</small></div><span>${fmt(a.elapsedMs)}</span></div>`:'';}).join('') || '<p class="empty">Aucune arrivée enregistrée.</p>'}
          </div>
        </div>

        <aside class="day-side">
          <div class="day-panel"><div class="section-head"><div><span class="eyebrow">EN COURS</span><h3>Courses actives</h3></div></div>
            <div class="race-list">${active.length ? active.map(r=>{const a=state.students.filter(s=>s.raceId===r.id), d=a.filter(s=>s.elapsedMs!=null).length;return `<div class="active-card"><div><strong>${esc(r.name)}</strong><span>Départ ${new Date(r.startedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span><div class="active-race-clock" data-race-clock="${r.startedAt}">${fmtRaceClock(Date.now()-r.startedAt)}</div><small class="active-race-clock-label">TEMPS DE COURSE</small><b>${d}/${a.length} arrivés</b></div><div class="progress"><i style="width:${a.length?Math.round(d/a.length*100):0}%"></i></div><div class="active-race-actions"><button class="reset-start" data-reset-start="${r.id}" ${d===0?'':'disabled'}>Annuler le départ</button><button class="finish-now" data-finish-race="${r.id}">TERMINER</button></div></div>`;}).join('') : '<p class="empty">Aucune course en cours.</p>'}</div>
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
        <div class="card table-card results-main" id="race-results-panel">${selectedRace?`<div class="card-head"><div><h3>${esc(selectedRace.name)}</h3><p>${raceRows.length} classés</p></div><div class="result-actions"><button class="button" data-reopen-result="${selectedRace.id}">Réouvrir</button><button class="button danger-ghost" data-delete-finished="${selectedRace.id}">Supprimer la course</button><button class="button" data-export-race="${selectedRace.id}">Exporter PDF</button></div></div>${raceRows.length?`<table><thead><tr><th>Rang</th><th>Dossard</th><th>Élève</th><th>Classe</th><th>Temps</th><th>Vitesse</th><th></th></tr></thead><tbody>${raceRows.map(r=>`<tr><td><b>${r.rank}</b></td><td>#${r.bib}</td><td>${esc(r.name)}</td><td>${esc(r.className)}</td><td><b>${r.time}</b></td><td>${r.speed}</td><td><button class="row-edit" data-edit-result="${r.studentId}">Modifier</button></td></tr>`).join('')}</tbody></table>`:'<p class="empty">Aucune arrivée.</p>'}`:'<p class="empty">Sélectionne une course.</p>'}</div></div>`;
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
      <div class="teacher-box teacher-picker">
        <div><span class="teacher-label">Professeur d’EPS référent</span><strong class="teacher-current">${teacher?esc(teacher):'À renseigner'}</strong></div>
        <div class="teacher-options">${EPS_TEACHERS.map(name=>`<button class="teacher-choice ${teacher===name?'selected':''}" data-class-teacher-name="${esc(name)}">${esc(name)}</button>`).join('')}</div>
        ${teacher?`<button class="teacher-clear" id="clear-class-teacher">Retirer l’attribution</button>`:''}
      </div>
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
    const activeRaces=state.races.filter(r=>r.startedAt&&!r.endedAt).sort((a,b)=>a.startedAt-b.startedAt);
    const groups=activeRaces.map(r=>{
      const students=state.students
        .filter(s=>s.raceId===r.id&&s.elapsedMs==null&&(
          !q ||
          String(s.bib||'').includes(q) ||
          nameOf(s).toLowerCase().includes(q) ||
          String(s.className||'').toLowerCase().includes(q) ||
          String(r.name||'').toLowerCase().includes(q)
        ))
        .sort((a,b)=>Number(a.bib||0)-Number(b.bib||0)||nameOf(a).localeCompare(nameOf(b),'fr'));
      return {race:r,students};
    }).filter(g=>g.students.length);
    const pending=activeRaces.reduce((n,r)=>n+state.students.filter(s=>s.raceId===r.id&&s.elapsedMs==null).length,0);

    return `<div class="modal-backdrop manual-backdrop"><div class="modal manual-modal"><div class="modal-head"><div><span class="eyebrow">TEMPS FIGÉ</span><h2>Sans dossard</h2><p>${new Date(manualStamp).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} · ${activeRaces.length} course${activeRaces.length>1?'s':''} active${activeRaces.length>1?'s':''} · ${pending} élèves encore en course</p><p>Le scanner reste actif en arrière-plan. ${state.manualPending?.length>1?state.manualPending.length+' temps sans dossard sont en attente.':''}</p></div><button class="close" id="close-modal">×</button></div>
      <button class="button queue-no-bib" id="queue-no-bib">+ Figer un autre temps sans dossard maintenant</button>
      <input class="manual-search" id="manual-search" value="${esc(manualQuery)}" placeholder="Nom, classe, dossard ou course">
      <div class="candidate-list manual-groups">${groups.map(g=>`
        <section class="manual-race-group">
          <div class="manual-race-title"><strong>${esc(g.race.name)}</strong><span>${g.students.length} élève${g.students.length>1?'s':''}</span></div>
          ${g.students.map(s=>`<button data-manual="${s.id}"><strong>#${esc(s.bib||'—')}</strong><span>${esc(nameOf(s))} · ${esc(s.className)}</span><small>${esc(g.race.name)}</small></button>`).join('')}
        </section>`).join('') || '<p class="empty">Aucun élève correspondant dans les courses actives.</p>'}</div>
    </div></div>`;
  }

  function finishRaceModal() {
    const r=raceOf(finishConfirmRaceId);
    if(!r) return '';
    const runners=state.students.filter(s=>s.raceId===r.id);
    const missing=runners.filter(s=>s.elapsedMs==null);
    const arrived=runners.length-missing.length;
    const shortList=missing.length && missing.length<=5 ? `<div class="missing-names">${missing.map(s=>`<span>#${esc(s.bib)} · ${esc(nameOf(s))}</span>`).join('')}</div>` : '';
    return `<div class="modal-backdrop"><div class="modal confirm-modal finish-course-modal">
      <div class="modal-head"><div><span class="eyebrow">FIN DE COURSE</span><h2>Terminer ${esc(r.name)} ?</h2><p>Vérifie le bilan avant de fermer définitivement la course.</p></div><button class="close" id="close-finish-modal">×</button></div>
      <div class="finish-summary"><div class="finish-ok"><strong>${arrived}</strong><span>arrivés</span></div><div class="${missing.length?'finish-missing':'finish-ok'}"><strong>${missing.length}</strong><span>sans arrivée</span></div><div><strong>${runners.length}</strong><span>inscrits</span></div></div>
      ${missing.length ? `<div class="finish-warning"><strong>${missing.length} élève${missing.length>1?'s':''} sans arrivée</strong><p>Tu pourras toujours réouvrir la course ensuite si un résultat manque ou doit être ajouté.</p>${shortList}</div>` : '<div class="finish-success">✓ Tous les élèves ont une arrivée enregistrée.</div>'}
      <div class="modal-actions"><button class="button" id="cancel-finish-race">Annuler</button><button class="button danger-solid" id="confirm-finish-race">Terminer la course</button></div>
    </div></div>`;
  }

  function resultEditModal() {
    const s=state.students.find(x=>x.id===resultEditStudentId);
    if(!s || s.elapsedMs==null) return '';
    const r=raceOf(s.raceId);
    const totalSec=Math.max(0,Math.round(s.elapsedMs/1000));
    const min=Math.floor(totalSec/60), sec=totalSec%60;
    return `<div class="modal-backdrop"><div class="modal result-edit-modal">
      <div class="modal-head"><div><span class="eyebrow">CORRIGER UN RÉSULTAT</span><h2>#${esc(s.bib)} · ${esc(nameOf(s))}</h2><p>${esc(r?.name||'')} · temps actuel ${fmt(s.elapsedMs)}</p></div><button class="close" id="close-result-edit">×</button></div>
      <div class="time-editor"><label>Minutes<input id="result-minutes" type="number" min="0" inputmode="numeric" value="${min}"></label><span>:</span><label>Secondes<input id="result-seconds" type="number" min="0" max="59" inputmode="numeric" value="${String(sec).padStart(2,'0')}"></label></div>
      <p class="edit-help">Le classement, la vitesse moyenne et les moyennes de classe/prof seront recalculés automatiquement.</p>
      <div class="modal-actions split-actions"><button class="button danger-ghost" id="delete-result">Supprimer ce résultat</button><div><button class="button" id="cancel-result-edit">Annuler</button><button class="button primary" id="save-result-edit">Enregistrer</button></div></div>
    </div></div>`;
  }

  function deleteFinishedRaceModal() {
    const r=raceOf(deleteFinishedRaceId);
    if(!r) return '';
    const runners=state.students.filter(s=>s.raceId===r.id);
    const finished=runners.filter(s=>s.elapsedMs!=null).length;
    return `<div class="modal-backdrop"><div class="modal confirm-modal delete-race-modal">
      <div class="modal-head"><div><span class="eyebrow">SUPPRESSION</span><h2>Supprimer ${esc(r.name)} ?</h2><p>Cette action supprimera la course et ses résultats.</p></div><button class="close" id="close-delete-race">×</button></div>
      <div class="delete-warning"><strong>${finished} chrono${finished>1?'s':''} seront supprimés</strong><p>Les ${runners.length} élèves resteront dans la liste et redeviendront disponibles pour recréer une course.</p></div>
      <div class="modal-actions"><button class="button" id="cancel-delete-race">Annuler</button><button class="button danger-solid" id="confirm-delete-race">Supprimer définitivement</button></div>
    </div></div>`;
  }

  function updateRaceClocks() {
    document.querySelectorAll('[data-race-clock]').forEach(el=>{
      const startedAt=Number(el.dataset.raceClock);
      if(Number.isFinite(startedAt)&&startedAt>0) el.textContent=fmtRaceClock(Date.now()-startedAt);
    });
  }

  function bind() {
    clearInterval(raceClockTimer);
    raceClockTimer=null;
    updateRaceClocks();
    if(document.querySelector('[data-race-clock]')) raceClockTimer=setInterval(updateRaceClocks,1000);
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;save();render();});
    $('#student-file')?.addEventListener('change',e=>importStudents(e.target.files?.[0]));
    $('#bibs')?.addEventListener('click',exportBibs);
    $('#backup')?.addEventListener('click',exportBackup);
    $('#backup-file')?.addEventListener('change',e=>restoreBackup(e.target.files?.[0]));
    $('#student-search')?.addEventListener('input',e=>{studentSearch=e.target.value;render();setTimeout(()=>{const x=$('#student-search');if(x){x.focus();x.setSelectionRange(x.value.length,x.value.length);}},0);});
    document.querySelectorAll('[data-open-class]').forEach(b=>b.onclick=()=>{openClass=b.dataset.openClass;render();});
    $('#close-class')?.addEventListener('click',()=>{openClass='';render();});
    document.querySelectorAll('[data-class-teacher-name]').forEach(b=>b.onclick=()=>assignClassTeacher(openClass,b.dataset.classTeacherName));
    $('#clear-class-teacher')?.addEventListener('click',()=>assignClassTeacher(openClass,''));
    $('#add-student')?.addEventListener('click',()=>{studentEditorId='new';render();});
    document.querySelectorAll('[data-edit-student]').forEach(b=>b.onclick=()=>{studentEditorId=b.dataset.editStudent;render();});
    $('#close-student')?.addEventListener('click',()=>{studentEditorId=null;render();});
    $('#save-student')?.addEventListener('click',saveStudentEditor);

    document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{
      const wasSelected=b.classList.contains('selected');
      document.querySelectorAll('[data-level]').forEach(x=>x.classList.remove('selected'));
      if(!wasSelected) b.classList.add('selected');
      updateRaceCount();
    });
    document.querySelectorAll('[data-sex]').forEach(b=>b.onclick=()=>{
      const wasSelected=b.classList.contains('selected');
      document.querySelectorAll('[data-sex]').forEach(x=>x.classList.remove('selected'));
      if(!wasSelected) b.classList.add('selected');
      updateRaceCount();
    });
    $('#create-race')?.addEventListener('click',createRace);
    document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteRace(b.dataset.delete));
    document.querySelectorAll('[data-arm-race]').forEach(b=>b.onclick=()=>{armedRaceId=b.dataset.armRace;render();});
    $('#cancel-armed')?.addEventListener('click',()=>{armedRaceId='';render();});
    $('#launch-armed')?.addEventListener('click',()=>{if(armedRaceId) startRace(armedRaceId);});
    document.querySelectorAll('[data-reset-start]').forEach(b=>b.onclick=()=>resetRaceStart(b.dataset.resetStart));
    document.querySelectorAll('[data-finish-race]').forEach(b=>b.onclick=()=>{finishConfirmRaceId=b.dataset.finishRace;render();});
    $('#close-finish-modal')?.addEventListener('click',()=>{finishConfirmRaceId='';render();});
    $('#cancel-finish-race')?.addEventListener('click',()=>{finishConfirmRaceId='';render();});
    $('#confirm-finish-race')?.addEventListener('click',confirmFinishRace);
    document.querySelectorAll('[data-reopen]').forEach(b=>b.onclick=()=>reopenRace(b.dataset.reopen));
    $('#save-settings')?.addEventListener('click',saveSettings);

    $('#no-bib')?.addEventListener('click',()=>{ if(state.manualPending?.length){ manualStamp=state.manualPending[0]; manualQuery=''; render(); } else freezeNoBibTime(); });
    $('#queue-no-bib')?.addEventListener('click',freezeNoBibTime);
    $('#close-modal')?.addEventListener('click',closeManual);
    $('#manual-search')?.addEventListener('input',e=>{
      manualQuery=e.target.value;
      clearTimeout(manualSearchTimer);
      manualSearchTimer=setTimeout(()=>{
        if(manualStamp===null) return;
        render();
        setTimeout(()=>{const x=$('#manual-search');if(x){x.focus();x.setSelectionRange(x.value.length,x.value.length);}},0);
      },260);
    });
    document.querySelectorAll('[data-manual]').forEach(b=>b.onclick=()=>manualFinish(b.dataset.manual));
    $('#undo')?.addEventListener('click',undoLast);
    $('#test-scan')?.addEventListener('click',()=>{
      scannerTestMode=true;
      state.notice='TEST SCANNER · scanne un dossard · aucun chrono ne sera enregistré';
      state.noticeKind='info';
      save(); render();
    });

    document.querySelectorAll('[data-result-mode]').forEach(b=>b.onclick=()=>{state.resultMode=b.dataset.resultMode;save();render();});
    $('#export-all-results')?.addEventListener('click',exportResultsPdf);
    $('#export-excel')?.addEventListener('click',exportExcel);
    document.querySelectorAll('[data-view-race]').forEach(b=>b.onclick=()=>{state.resultRaceId=b.dataset.viewRace;save();render();});
    document.querySelectorAll('[data-export-race]').forEach(b=>b.onclick=()=>exportRacePdf(b.dataset.exportRace));
    document.querySelectorAll('[data-reopen-result]').forEach(b=>b.onclick=()=>reopenRace(b.dataset.reopenResult));
    document.querySelectorAll('[data-edit-result]').forEach(b=>b.onclick=()=>{resultEditStudentId=b.dataset.editResult;render();});
    $('#close-result-edit')?.addEventListener('click',()=>{resultEditStudentId='';render();});
    $('#cancel-result-edit')?.addEventListener('click',()=>{resultEditStudentId='';render();});
    $('#save-result-edit')?.addEventListener('click',saveResultEdit);
    $('#delete-result')?.addEventListener('click',deleteResult);
    document.querySelectorAll('[data-delete-finished]').forEach(b=>b.onclick=()=>{deleteFinishedRaceId=b.dataset.deleteFinished;render();});
    $('#close-delete-race')?.addEventListener('click',()=>{deleteFinishedRaceId='';render();});
    $('#cancel-delete-race')?.addEventListener('click',()=>{deleteFinishedRaceId='';render();});
    $('#confirm-delete-race')?.addEventListener('click',confirmDeleteFinishedRace);

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
    if(anyRaceStarted()) return notify('Import verrouillé après le premier départ. Supprime d’abord les courses de test si tu veux réimporter.','warning');
    try {
      let rows;
      if (file.name.toLowerCase().endsWith('.csv')) rows=parseCsv(await file.text());
      else {
        if(!window.XLSX) throw new Error('Module Excel indisponible. Recharge l’application avec Internet.');
        const wb=XLSX.read(await file.arrayBuffer()), ws=wb.Sheets[wb.SheetNames[0]];
        rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      }

      const students=rows.map(row=>{
        const className=String(pick(row,['classe','class','classname'])).trim();
        const rawBib=String(pick(row,['dossard','numero','numéro','bib','n° dossard','nº dossard','n dossard','ndossard','no dossard','numero dossard','numéro dossard','numerodossard','numérodossard'])??'').trim();
        const bib=rawBib!=='' ? Number(rawBib) : null;
        return {
          id:uid(),
          lastName:String(pick(row,['nom','lastname','name'])).trim(),
          firstName:String(pick(row,['prenom','prénom','firstname'])).trim(),
          className,
          level:levelOf(className,pick(row,['niveau','level'])),
          sex:sexOf(pick(row,['sexe','genre','sex'])),
          teacher:String(pick(row,['enseignant','professeur','professeureps','eps','professeurprincipal','pp','teacher'])).trim(),
          bib:Number.isInteger(bib)&&bib>0?bib:null
        };
      }).filter(s=>s.lastName&&s.className);

      if(!students.length) throw new Error('Aucun élève détecté. Il faut au minimum Nom et Classe.');
      if(state.students.length && !confirm(`Remplacer les ${state.students.length} élèves actuels ? Les courses et chronos seront effacés.`)) return;

      const classTeachers={};
      students.forEach(s=>{
        if(s.teacher){
          classTeachers[s.className] ||= [];
          if(!classTeachers[s.className].includes(s.teacher)) classTeachers[s.className].push(s.teacher);
        }
      });
      Object.keys(classTeachers).forEach(k=>classTeachers[k]=classTeachers[k].slice(0,1));

      state={...EMPTY,students,classTeachers,notice:`${students.length} élèves importés`,noticeKind:'good'};
      openClass=''; studentEditorId=null; studentSearch='';
      save(); render();
    } catch(e) { notify(e.message || 'Import impossible','error'); }
  }

  function parseCsv(text) {
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean); if(!lines.length) return [];
    const sep=(lines[0].match(/;/g)||[]).length >= (lines[0].match(/,/g)||[]).length ? ';' : ',';
    const split=line => { const out=[]; let cur='', quoted=false; for(let i=0;i<line.length;i++){ const c=line[i]; if(c==='"'){ if(quoted && line[i+1]==='"'){cur+='"';i++;} else quoted=!quoted; } else if(c===sep && !quoted){out.push(cur);cur='';} else cur+=c; } out.push(cur); return out; };
    const head=split(lines[0]); return lines.slice(1).map(line => { const vals=split(line), o={}; head.forEach((h,i)=>o[h]=vals[i]??''); return o; });
  }

  function raceAutoName(level,sex) {
    const sexLabel={F:'Filles',M:'Garçons',X:'Non renseigné'}[sex] || '';
    return level && sexLabel ? `${level} ${sexLabel}` : '';
  }

  function updateRaceCount() {
    const out=$('#race-count');
    if(!out) return;
    const levels=[...document.querySelectorAll('[data-level].selected')].map(x=>x.dataset.level);
    const sexes=[...document.querySelectorAll('[data-sex].selected')].map(x=>x.dataset.sex);
    const count=state.students.filter(s=>!s.raceId&&levels.includes(s.level)&&sexes.includes(s.sex)).length;
    out.textContent=String(count);
    const label=out.nextElementSibling;
    if(label) label.textContent=count>1?'élèves sélectionnés':'élève sélectionné';
    const namePreview=$('#race-name-preview');
    if(namePreview) namePreview.textContent=(levels.length===1&&sexes.length===1) ? raceAutoName(levels[0],sexes[0]) : 'Sélectionne un niveau et un sexe';
  }

  function matchingRaceFor(level,sex,{unstartedOnly=true}={}) {
    return state.races.find(r=>(!unstartedOnly || !r.startedAt) && !r.endedAt && r.levels?.includes(level) && r.sexes?.includes(sex));
  }

  function saveStudentEditor() {
    const lastName=$('#student-last')?.value.trim()||'';
    const firstName=$('#student-first')?.value.trim()||'';
    const className=$('#student-class')?.value.trim()||'';
    const sex=$('#student-sex')?.value||'X';
    const bibRaw=$('#student-bib')?.value.trim()||'';
    const bib=bibRaw?Number(bibRaw):null;
    if(!lastName||!className) return notify('Nom et classe obligatoires.','error');
    if(bibRaw && (!Number.isInteger(bib)||bib<=0)) return notify('Dossard invalide.','error');

    const duplicate=state.students.find(s=>Number.isInteger(bib)&&s.bib===bib&&s.id!==studentEditorId);
    if(duplicate) return notify(`Le dossard ${bib} est déjà attribué à ${nameOf(duplicate)}.`,'error');

    if(studentEditorId==='new'){
      const level=levelOf(className,'');
      const matching=matchingRaceFor(level,sex);
      const startedMatching=state.races.find(r=>r.startedAt&&!r.endedAt&&r.levels?.includes(level)&&r.sexes?.includes(sex));
      state.students.push({id:uid(),lastName,firstName,className,level,sex,bib,raceId:matching?.id||null});
      state.notice=matching
        ? `${lastName.toUpperCase()} ${firstName} ajouté à ${className} et à la course ${matching.name}`
        : startedMatching
          ? `${lastName.toUpperCase()} ${firstName} ajouté · ATTENTION : ${startedMatching.name} a déjà démarré, élève non affecté`
          : `${lastName.toUpperCase()} ${firstName} ajouté à ${className}`;
      state.noticeKind=startedMatching&&!matching?'warning':'good';
    } else {
      const s=state.students.find(x=>x.id===studentEditorId);
      if(!s) return;
      const oldLevel=s.level, oldSex=s.sex;
      const newLevel=levelOf(className,'');
      const currentRace=raceOf(s.raceId);
      if(currentRace?.startedAt && (oldLevel!==newLevel || oldSex!==sex)) return notify('Impossible de changer le niveau ou le sexe après le départ de sa course.','error');
      Object.assign(s,{lastName,firstName,className,level:newLevel,sex,bib});
      if(currentRace && !currentRace.startedAt && (oldLevel!==newLevel || oldSex!==sex)){
        delete s.raceId;
        const matching=matchingRaceFor(newLevel,sex);
        if(matching) s.raceId=matching.id;
      }
      state.notice=`${lastName.toUpperCase()} ${firstName} modifié`;
    }
    if(studentEditorId!=='new') state.noticeKind='good';
    openClass=className;
    studentEditorId=null;
    save(); render();
  }

  function createRace() {
    const levels=[...document.querySelectorAll('[data-level].selected')].map(x=>x.dataset.level);
    const sexes=[...document.querySelectorAll('[data-sex].selected')].map(x=>x.dataset.sex);
    if(levels.length!==1||sexes.length!==1) return notify('Sélectionne un niveau et un sexe.','warning');
    const name=raceAutoName(levels[0],sexes[0]);
    const runners=state.students.filter(s=>!s.raceId&&levels.includes(s.level)&&sexes.includes(s.sex));
    if(!runners.length) return notify('Aucun élève disponible pour ces critères.','warning');
    const race={id:uid(),name,levels,sexes,createdAt:Date.now()};
    state.races.push(race);
    runners.forEach(s=>s.raceId=race.id);
    state.notice=`${name} créée · ${runners.length} élèves`;
    state.noticeKind='good';
    save(); render();
  }

  function deleteRace(id) {
    const r=raceOf(id);
    if(!r||r.startedAt) return;
    if(!confirm(`Supprimer « ${r.name} » ?`)) return;
    state.students.forEach(s=>{if(s.raceId===id) delete s.raceId;});
    state.races=state.races.filter(x=>x.id!==id);
    state.notice=`${r.name} supprimée`; state.noticeKind='info';
    save(); render();
  }

  function startRace(id) {
    const r=raceOf(id);
    if(!r||r.startedAt) return;
    if(!state.crossDistanceM){ state.tab='races'; return notify('Renseigne la distance avant le premier départ.','warning'); }
    r.startedAt=Date.now();
    delete r.endedAt;
    armedRaceId='';
    state.notice=`${r.name} · DÉPART enregistré à ${new Date(r.startedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
    state.noticeKind='good';
    state.tab='timing';
    save(); render();
  }

  function resetRaceStart(id) {
    const r=raceOf(id);
    if(!r?.startedAt || r.endedAt) return;
    const arrived=state.students.filter(s=>s.raceId===id&&s.elapsedMs!=null).length;
    if(arrived) return notify('Impossible d’annuler le départ après une première arrivée.','error');
    if(!confirm(`Annuler le départ de « ${r.name} » ? La course reviendra dans les courses à préparer.`)) return;
    delete r.startedAt;
    delete r.endedAt;
    state.notice=`Départ annulé · ${r.name} est de nouveau prête à être lancée`;
    state.noticeKind='warning';
    save(); render();
  }

  function confirmFinishRace() {
    const id=finishConfirmRaceId;
    const r=raceOf(id);
    if(!r?.startedAt||r.endedAt){ finishConfirmRaceId=''; return render(); }
    const runners=state.students.filter(s=>s.raceId===id);
    const missing=runners.filter(s=>s.elapsedMs==null);
    r.endedAt=Date.now();
    finishConfirmRaceId='';
    state.notice=`${r.name} terminée · ${runners.length-missing.length}/${runners.length} classés`;
    state.noticeKind='good';
    save(); render();
  }

  function reopenRace(id) {
    const r=raceOf(id);
    if(!r?.endedAt) return;
    if(!confirm(`Réouvrir « ${r.name} » ? L’heure de départ et les chronos existants restent inchangés.`)) return;
    delete r.endedAt;
    state.notice=`${r.name} réouverte`; state.noticeKind='warning';
    save(); render();
  }

  function saveResultEdit() {
    const s=state.students.find(x=>x.id===resultEditStudentId);
    const r=s ? raceOf(s.raceId) : null;
    if(!s||!r?.startedAt) return;
    const min=Number($('#result-minutes')?.value);
    const sec=Number($('#result-seconds')?.value);
    if(!Number.isInteger(min)||min<0||!Number.isInteger(sec)||sec<0||sec>59) return notify('Temps invalide. Utilise des minutes et des secondes entre 0 et 59.','error');
    const elapsedMs=(min*60+sec)*1000;
    if(elapsedMs<=0) return notify('Le temps doit être supérieur à 0 seconde.','error');
    const stamp=r.startedAt+elapsedMs;
    s.elapsedMs=elapsedMs;
    s.finishedAt=stamp;
    const arrival=state.arrivals.slice().reverse().find(a=>a.studentId===s.id&&a.raceId===r.id);
    if(arrival){
      arrival.elapsedMs=elapsedMs;
      arrival.stamp=stamp;
      arrival.method='corrected';
    } else {
      state.arrivals.push({id:uid(),studentId:s.id,raceId:r.id,stamp,elapsedMs,method:'corrected'});
    }
    state.notice=`Résultat corrigé · #${s.bib} ${nameOf(s)} · ${fmt(elapsedMs)}`;
    state.noticeKind='good';
    resultEditStudentId='';
    save(); render();
  }

  function deleteResult() {
    const s=state.students.find(x=>x.id===resultEditStudentId);
    if(!s) return;
    const raceId=s.raceId;
    delete s.elapsedMs;
    delete s.finishedAt;
    state.arrivals=state.arrivals.filter(a=>!(a.studentId===s.id&&a.raceId===raceId));
    state.notice=`Résultat supprimé · #${s.bib} ${nameOf(s)}`;
    state.noticeKind='warning';
    resultEditStudentId='';
    save(); render();
  }

  function confirmDeleteFinishedRace() {
    const id=deleteFinishedRaceId;
    const r=raceOf(id);
    if(!r){ deleteFinishedRaceId=''; return render(); }
    state.students.forEach(s=>{
      if(s.raceId===id){
        delete s.raceId;
        delete s.elapsedMs;
        delete s.finishedAt;
      }
    });
    state.arrivals=state.arrivals.filter(a=>a.raceId!==id);
    state.races=state.races.filter(x=>x.id!==id);
    if(state.resultRaceId===id) state.resultRaceId='';
    deleteFinishedRaceId='';
    state.notice=`${r.name} supprimée · élèves de nouveau disponibles`;
    state.noticeKind='warning';
    save(); render();
  }

  function assignClassTeacher(className, teacher) {
    if(!className) return;
    if(teacher && !EPS_TEACHERS.includes(teacher)) return notify('Professeur non reconnu.','error');
    state.classTeachers ||= {};
    state.classTeachers[className]=teacher?[teacher]:[];
    state.notice=teacher?`${teacher} référent EPS de ${className}`:`Professeur EPS retiré pour ${className}`;
    state.noticeKind='good';
    save(); render();
  }

  function finish(student, stamp, method) {
    if(student.elapsedMs!=null) return notify(`DÉJÀ ARRIVÉ · #${student.bib} ${nameOf(student)} · ${fmt(student.elapsedMs)}`,'error');
    const race=raceOf(student.raceId);
    if(!race?.startedAt) return notify(`Course non démarrée · ${nameOf(student)}`,'error');
    if(race.endedAt) return notify(`Course terminée · réouvre « ${race.name} »`,'error');
    const elapsedMs=Math.max(0,stamp-race.startedAt);
    student.finishedAt=stamp;
    student.elapsedMs=elapsedMs;
    state.arrivals.push({id:uid(),studentId:student.id,raceId:race.id,stamp,elapsedMs,method});
    state.notice=`#${student.bib} · ${nameOf(student)} · ${fmt(elapsedMs)}`;
    state.noticeKind='good';
    save(); render();
  }

  function scan(raw) {
    state.scannerSeen=true;
    state.scannerLastAt=Date.now();
    state.lastScan=raw;
    const m=String(raw).trim().match(/(\d+)/);
    if(!m){
      if(scannerTestMode) scannerTestMode=false;
      return notify(`CODE NON RECONNU · ${raw}`,'error');
    }
    const bib=Number(m[1]);
    const s=state.students.find(x=>x.bib===bib);
    if(scannerTestMode){
      scannerTestMode=false;
      if(!s) return notify(`SCANNER OK · code ${bib} lu mais dossard inconnu`,'warning');
      state.notice=`SCANNER OK · #${bib} ${nameOf(s)} reconnu · aucun chrono enregistré`;
      state.noticeKind='good';
      save(); render();
      return;
    }
    if(!s) return notify(`DOSSARD ${bib} INCONNU`,'error');
    finish(s,Date.now(),'scan');
  }

  function freezeNoBibTime() {
    const stamp=Date.now();
    if(!Array.isArray(state.manualPending)) state.manualPending=[];
    state.manualPending.push(stamp);
    if(manualStamp===null) manualStamp=state.manualPending[0];
    manualQuery='';
    state.notice=state.manualPending.length===1?'Temps sans dossard figé':state.manualPending.length+' temps sans dossard en attente';
    state.noticeKind='warning';
    save(); render();
  }

  function manualFinish(id) {
    const s=state.students.find(x=>x.id===id);
    if(!s||manualStamp===null) return;
    const stamp=manualStamp;
    if(!Array.isArray(state.manualPending)) state.manualPending=[];
    if(state.manualPending[0]===stamp) state.manualPending.shift();
    manualStamp=state.manualPending.length?state.manualPending[0]:null;
    manualQuery='';
    finish(s,stamp,'manual');
  }

  function closeManual(){
    manualStamp=null;
    manualQuery='';
    if(Array.isArray(state.manualPending)&&state.manualPending.length){
      state.notice=state.manualPending.length+' temps sans dossard en attente';
      state.noticeKind='warning';
      save();
    }
    render();
  }

  function undoLast() {
    const a=state.arrivals.at(-1);
    if(!a) return notify('Aucune arrivée à annuler.','info');
    const s=state.students.find(x=>x.id===a.studentId);
    if(!s) return;
    if(!confirm(`Annuler l’arrivée de #${s.bib} ${nameOf(s)} en ${fmt(a.elapsedMs)} ?`)) return;
    delete s.finishedAt; delete s.elapsedMs;
    state.arrivals.pop();
    state.notice=`Arrivée annulée · #${s.bib} ${nameOf(s)}`;
    state.noticeKind='warning';
    save(); render();
  }

  function rankings() {
    const finished=state.students.filter(s=>s.elapsedMs!=null), individual=[], byRace=[], byClass=[], classAverages=[], classOverall=[], teacherAverages=[];
    const indiv=new Map(); finished.forEach(s=>{const k=`${s.level}|${s.sex}`; if(!indiv.has(k)) indiv.set(k,[]); indiv.get(k).push(s);});
    [...indiv.entries()].sort().forEach(([k,a])=>{const[level,sex]=k.split('|');a.sort((x,y)=>x.elapsedMs-y.elapsedMs);a.forEach((s,i)=>individual.push({level,sex,rank:i+1,bib:s.bib,name:nameOf(s),className:s.className,time:fmt(s.elapsedMs)}));});
    state.races.forEach(r=>{ const a=finished.filter(s=>s.raceId===r.id).sort((x,y)=>x.elapsedMs-y.elapsedMs); a.forEach((s,i)=>byRace.push({raceId:r.id,raceName:r.name,studentId:s.id,rank:i+1,bib:s.bib,name:nameOf(s),className:s.className,time:fmt(s.elapsedMs),speed:fmtSpeed(s)})); });
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
    if(anyRaceStarted()) return notify('La distance est verrouillée après le premier départ.','warning');
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
    // Libère immédiatement ~35 Mo de bitmap sur iPad ; le PNG en mémoire suffit ensuite.
    canvas.width=1;
    canvas.height=1;
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

  async function preflightBibs() {
    const issues=bibIssues();
    if(issues.length) throw new Error(`Impossible de créer les dossards : ${issues.length} anomalie(s). ${issues[0]}`);
    if(!window.JsBarcode || !window.QRCode) throw new Error('Modules QR / Code 128 indisponibles.');
    if(!state.students.length) throw new Error('Aucun élève à imprimer.');

    // Tester quelques valeurs suffit : tous les dossards sont numériques et ont déjà été validés.
    const checks=[state.students[0],state.students[Math.floor(state.students.length/2)],state.students.at(-1)].filter(Boolean);
    for(const s of checks){
      const value=String(s.bib);
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      JsBarcode(svg,value,{format:'CODE128',displayValue:false,height:40,margin:8,width:2});
      if(svg.querySelectorAll('rect').length<2) throw new Error(`Code 128 invalide pour le dossard ${value}`);
      const holder=document.createElement('div');
      new QRCode(holder,{text:value,width:160,height:160,correctLevel:QRCode.CorrectLevel.H});
      const q=holder.querySelector('canvas')||holder.querySelector('img');
      if(!q) throw new Error(`QR invalide pour le dossard ${value}`);
      if(q.tagName==='CANVAS'){ q.width=1; q.height=1; }
    }
    await new Promise(resolve=>requestAnimationFrame(resolve));
    return true;
  }

  async function exportBibs() {
    if(!window.jspdf?.jsPDF || !window.JsBarcode || !window.QRCode) return notify('Module dossards indisponible. Recharge avec Internet.','error');
    const button=document.getElementById('bibs');
    const originalLabel=button?.textContent||'Créer les dossards PDF';
    if(button){ button.disabled=true; button.textContent='Préparation du PDF…'; }

    try {
      await preflightBibs();

      let backgroundData;
      try { backgroundData=buildBibBackgroundData(); }
      catch(e){ throw new Error(e.message || 'Fond haute définition du dossard indisponible'); }

      const {jsPDF}=window.jspdf;
      const doc=new jsPDF({
        unit:'mm',
        format:'a4',
        orientation:'landscape',
        compress:true,
        putOnlyUsedFonts:true
      });
      const W=297,H=210,centerX=W/2,total=state.students.length;

      for(let i=0;i<total;i++){
        const s=state.students[i];
        if(i) doc.addPage('a4','landscape');

        // Le fond est référencé une seule fois dans le PDF grâce à l'alias.
        doc.addImage(backgroundData,'PNG',0,0,W,H,'bibBackgroundHD','FAST');

        // Code 128 entièrement vectoriel.
        drawVectorBarcode(doc,String(s.bib),98,58,101,17);

        const bib=String(s.bib);
        const bibSize=fitPdfText(doc,bib,112,150,82,'helvetica','bold');
        doc.setFont('helvetica','bold');
        doc.setFontSize(bibSize);
        doc.text(bib,centerX,132,{align:'center'});

        const classY=drawStudentName(doc,s,centerX);
        doc.setFont('helvetica','bold');
        doc.setFontSize(11.5);
        doc.text(String(s.className||''),centerX,classY,{align:'center'});

        // 320 px sur 37 mm = ~220 dpi : très largement suffisant pour un QR imprimé,
        // tout en utilisant ~10x moins de mémoire qu'un canvas 1024 px.
        doc.setFillColor(255,255,255);
        doc.rect(126,160,45,44,'F');
        const holder=document.createElement('div');
        new QRCode(holder,{
          text:String(s.bib),
          width:320,
          height:320,
          correctLevel:QRCode.CorrectLevel.H
        });
        const qrCanvas=holder.querySelector('canvas'), qrImg=holder.querySelector('img');
        const qrData=qrCanvas ? qrCanvas.toDataURL('image/png') : qrImg?.src;
        if(qrData) doc.addImage(qrData,'PNG',130,164,37,37,undefined,'FAST');

        // Safari iPad a besoin qu'on lui rende la main pour libérer les canvases précédents.
        if(qrCanvas){ qrCanvas.width=1; qrCanvas.height=1; }
        if(i%8===7 || i===total-1){
          if(button) button.textContent=`PDF · ${i+1}/${total}`;
          await new Promise(resolve=>requestAnimationFrame(resolve));
        }
      }

      if(button) button.textContent='Finalisation du PDF…';
      await new Promise(resolve=>setTimeout(resolve,0));
      doc.save('dossards-cross-ada-lovelace-2026.pdf');

      state.notice=`${total}/${total} dossards contrôlés et générés`;
      state.noticeKind='good';
      save();
      render();
    } catch(e) {
      notify(e.message || 'Création du PDF impossible','error');
    } finally {
      const b=document.getElementById('bibs');
      if(b){ b.disabled=false; b.textContent=originalLabel; }
    }
  }

  function downloadTemplate(){ downloadBlob('\uFEFFNom;Prénom;Classe;Niveau;Sexe;Enseignant;Dossard\nDUPONT;Lina;6A;6e;F;Mme Martin;1\nMARTIN;Noé;6A;6e;M;Mme Martin;2\n','modele-eleves-cross.csv','text/csv;charset=utf-8'); }
  function exportBackup(){
    const payload={format:'cross-ada-lovelace-backup-v1',exportedAt:new Date().toISOString(),state};
    downloadBlob(JSON.stringify(payload,null,2),'sauvegarde-cross.json','application/json');
  }

  async function restoreBackup(file){
    if(!file) return;
    try{
      const parsed=JSON.parse(await file.text());
      const restored=parsed?.state ?? parsed;
      if(!restored || !Array.isArray(restored.students) || !Array.isArray(restored.races) || !Array.isArray(restored.arrivals)) throw new Error('Fichier de sauvegarde invalide.');
      if((state.students.length||state.races.length||state.arrivals.length) && !confirm('Restaurer cette sauvegarde ? Les données actuellement présentes sur cet iPad seront remplacées.')) return;
      state={...EMPTY,...restored};
      openClass=''; studentEditorId=null; manualStamp=null; resultEditStudentId=''; deleteFinishedRaceId='';
      state.notice=`Sauvegarde restaurée · ${state.students.length} élèves · ${state.races.length} courses`;
      state.noticeKind='good';
      save(); render();
    }catch(e){ notify(e.message||'Restauration impossible','error'); }
  }
  function downloadBlob(content,name,type){ const blob=new Blob([content],{type}), a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

  document.addEventListener('keydown', e => {
    if(state.tab!=='timing') return;
    const now=performance.now();
    if(e.key==='Enter' || e.key==='Tab'){
      const fast=scanBuffer.length>=3 && (now-scanStartedAt)<1000;
      const code=scanBuffer;
      scanBuffer='';
      if(fast){
        e.preventDefault();
        if(manualStamp!==null && manualQuery.endsWith(code)) manualQuery=manualQuery.slice(0,-code.length).trim();
        scan(code);
      }
      return;
    }
    if(/^\d$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey){
      if(!scanBuffer || now-scanLastKey<120){
        if(!scanBuffer) scanStartedAt=now;
        scanBuffer+=e.key;
      } else {
        scanBuffer=e.key;
        scanStartedAt=now;
      }
      scanLastKey=now;
      return;
    }
    if(now-scanLastKey>150) scanBuffer='';
  }, true);

  window.addEventListener('online',()=>{syncStatus='pending';scheduleCloudSync(100);updateSyncBadge();});
  window.addEventListener('offline',()=>{syncStatus='offline';updateSyncBadge();});
  setInterval(()=>{if(syncPending) syncCloud();},15000);

  if('serviceWorker' in navigator) window.addEventListener('load', async () => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    try{
      if(!standalone){
        const hadController=!!navigator.serviceWorker.controller;
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg=>reg.unregister()));
        if('caches' in window){
          const keys=await caches.keys();
          await Promise.all(keys.filter(k=>k.startsWith('cross-college-')).map(k=>caches.delete(k)));
        }
        if(hadController && !sessionStorage.getItem('cross-browser-clean-v29')){
          sessionStorage.setItem('cross-browser-clean-v27','1');
          location.reload();
        }
        return;
      }
      const reg=await navigator.serviceWorker.register('/sw.js?v=29',{updateViaCache:'none'});
      await reg.update();
    }catch(_){}
  });
  render();
  scheduleCloudSync(250);
})();
