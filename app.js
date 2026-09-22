(() => {
  'use strict';
  const KEY = 'cross-college-state-v1';
  const initial = { students: [], races: [], finishes: [], tab: 'students', notice: 'Scanner en attente', lastScan: '' };

  const DEMO_STUDENTS = [
    [101,'DUPONT','Lina','6A','6e','F','Mme Martin'],
    [102,'MARTIN','Noé','6A','6e','M','Mme Martin'],
    [103,'BERNARD','Inès','6B','6e','F','M. Robert'],
    [104,'PETIT','Lucas','6B','6e','M','M. Robert'],
    [105,'MOREAU','Emma','5A','5e','F','Mme Garcia'],
    [106,'RICHARD','Jules','5A','5e','M','Mme Garcia'],
    [107,'DURAND','Chloé','5B','5e','F','M. Lopez'],
    [108,'SIMON','Hugo','5B','5e','M','M. Lopez'],
    [109,'LAURENT','Sarah','4A','4e','F','Mme Bernard'],
    [110,'MICHEL','Nathan','4A','4e','M','Mme Bernard'],
    [111,'GARCIA','Léa','3A','3e','F','M. Petit'],
    [112,'ROUX','Tom','3A','3e','M','M. Petit']
  ];
  let state = loadState();
  let manualStamp = null;
  let manualSearch = '';
  let scannerBuffer = '';
  let scannerLast = 0;

  const $ = sel => document.querySelector(sel);
  const app = document.getElementById('app');
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const padBib = n => String(n).padStart(3,'0');
  const displayName = s => `${String(s.lastName||'').toUpperCase()} ${s.firstName||''}`.trim();
  const formatElapsed = ms => {
    if (ms == null || !Number.isFinite(ms)) return '—';
    const t = Math.max(0, Math.floor(ms/1000));
    return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
  };
  const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
  const normalizeSex = v => {
    const s = String(v ?? '').trim().toLowerCase();
    if (['f','fille','femme','female','féminin','feminin'].includes(s)) return 'F';
    if (['m','garçon','garcon','homme','male','masculin'].includes(s)) return 'M';
    return 'X';
  };
  const deriveLevel = (className, explicit) => {
    if (String(explicit||'').trim()) return String(explicit).trim();
    const m = String(className||'').match(/(6|5|4|3)/);
    return m ? `${m[1]}e` : String(className||'').trim();
  };
  const normalizeHeader = s => String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const pick = (row, aliases) => {
    const wanted = aliases.map(normalizeHeader);
    for (const [k,v] of Object.entries(row)) if (wanted.includes(normalizeHeader(k))) return v;
    return '';
  };

  function loadState(){
    try { const raw = localStorage.getItem(KEY); return raw ? {...initial, ...JSON.parse(raw)} : {...initial}; }
    catch { return {...initial}; }
  }
  function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
  function setNotice(msg){ state.notice = msg; save(); render(); }
  function raceById(id){ return state.races.find(r=>r.id===id); }
  function levels(){ return [...new Set(state.students.map(s=>s.level).filter(Boolean))].sort(); }
  function selectedLevelsFromForm(){ return [...document.querySelectorAll('[data-level].selected')].map(x=>x.dataset.level); }
  function selectedSexesFromForm(){ return [...document.querySelectorAll('[data-sex].selected')].map(x=>x.dataset.sex); }

  function render(){
    const tabs = [
      ['students','1. Élèves & dossards'],['races','2. Courses'],['timing','3. Chronométrage'],['results','4. Résultats']
    ];
    app.innerHTML = `<div class="app-shell">
      <header class="topbar"><div><h1>Cross Collège</h1><p>Chronométrage iPad · dossards · résultats</p></div><div class="status-pill">${esc(state.notice)}</div></header>
      <nav class="tabs">${tabs.map(([id,label])=>`<button data-tab="${id}" class="${state.tab===id?'active':''}">${label}</button>`).join('')}</nav>
      <main>${renderPage()}</main>
      ${manualStamp!=null ? renderManualModal() : ''}
    </div>`;
    bind();
  }

  function renderPage(){
    if(state.tab==='students') return renderStudents();
    if(state.tab==='races') return renderRaces();
    if(state.tab==='timing') return renderTiming();
    return renderResults();
  }

  function renderStudents(){
    return `<section class="page-grid">
      <div class="card span-2"><div class="card-head"><div><h2>Liste des élèves</h2><p>Importe un fichier Excel, XLSX ou CSV.</p></div><strong>${state.students.length} élèves</strong></div>
        <div class="actions"><label class="button primary file-button">Importer Excel / CSV<input id="student-file" type="file" accept=".xlsx,.xls,.csv"></label><button class="button demo" id="demo">Charger la démo</button><button class="button" id="template">Télécharger le modèle</button><button class="button" id="bibs" ${state.students.length?'':'disabled'}>Créer les dossards PDF</button><button class="button" id="backup" ${state.students.length?'':'disabled'}>Sauvegarde JSON</button></div>
        <p class="hint">Colonnes reconnues : Nom, Prénom, Classe, Niveau, Sexe, Enseignant/PP, Dossard. Si le dossard manque, il est attribué automatiquement.</p></div>
      <div class="card span-2 table-card"><table><thead><tr><th>Dossard</th><th>Élève</th><th>Classe</th><th>Niveau</th><th>Sexe</th><th>Enseignant</th><th>Course</th></tr></thead><tbody>${state.students.map(s=>`<tr><td class="bib">#${s.bib}</td><td>${esc(displayName(s))}</td><td>${esc(s.className)}</td><td>${esc(s.level)}</td><td>${esc(s.sex)}</td><td>${esc(s.teacher||'—')}</td><td>${esc(s.raceId ? (raceById(s.raceId)?.name || 'Affectée') : '—')}</td></tr>`).join('')}</tbody></table></div>
    </section>`;
  }

  function renderRaces(){
    const lvls = levels();
    return `<section class="page-grid"><div class="card"><h2>Créer une course</h2>
      <label class="field">Nom de la course<input id="race-name" placeholder="Ex. 6e filles"></label>
      <div class="field"><span>Niveaux</span><div class="chip-row">${lvls.map(l=>`<button class="chip" data-level="${esc(l)}">${esc(l)}</button>`).join('')}</div></div>
      <div class="field"><span>Sexe</span><div class="chip-row"><button class="chip" data-sex="F">Filles</button><button class="chip" data-sex="M">Garçons</button><button class="chip" data-sex="X">Non renseigné</button></div></div>
      <button class="button primary full" id="create-race">Créer et affecter les élèves</button></div>
      <div class="card"><h2>Courses</h2><div class="race-list">${state.races.length?state.races.map(r=>{
        const participants=state.students.filter(s=>s.raceId===r.id), arrived=participants.filter(s=>s.elapsedMs!=null).length;
        return `<div class="race-row"><div><strong>${esc(r.name)}</strong><span>${participants.length} élèves · ${r.levels.map(esc).join(', ')} · ${r.sexes.join('/')}</span>${r.startedAt?`<span>Démarrée à ${new Date(r.startedAt).toLocaleTimeString('fr-FR')}</span>`:''}</div><div class="race-actions">${r.startedAt?`<span class="started">${arrived}/${participants.length} arrivés</span>`:`<button class="button danger-ghost" data-delete-race="${r.id}">Supprimer</button><button class="button start" data-start-race="${r.id}">DÉPART</button>`}</div></div>`;
      }).join(''):'<p class="empty">Aucune course créée.</p>'}</div></div></section>`;
  }

  function renderTiming(){
    const active=state.races.filter(r=>r.startedAt!=null);
    const pending=state.students.filter(s=>s.raceId && raceById(s.raceId)?.startedAt && s.elapsedMs==null).length;
    const finished=state.students.filter(s=>s.elapsedMs!=null).length;
    return `<section class="timing-layout"><div class="card timing-main"><div class="timing-title"><div><h2>Arrivées</h2><p>Scanne un dossard : le temps est enregistré immédiatement.</p></div><div class="live-dot">● SCANNER</div></div>
      <div class="big-notice">${esc(state.notice)}</div><div class="timing-stats"><div><strong>${active.length}</strong><span>courses démarrées</span></div><div><strong>${pending}</strong><span>élèves encore en course</span></div><div><strong>${finished}</strong><span>arrivées enregistrées</span></div></div>
      <div class="actions giant-actions"><button class="button warning" id="no-bib">SANS DOSSARD</button><button class="button" id="undo">Annuler la dernière arrivée</button><button class="button" id="test-scan">Tester le scanner</button></div>
      <p class="hint">Dernier code reçu : <strong>${esc(state.lastScan||'aucun')}</strong>. Le lecteur doit être jumelé à l’iPad en Bluetooth HID et envoyer Entrée après le code.</p></div>
      <div class="card"><h2>Courses actives</h2><div class="race-list">${active.length?active.map(r=>{const p=state.students.filter(s=>s.raceId===r.id),arr=p.filter(s=>s.elapsedMs!=null).length;return `<div class="race-row compact"><div><strong>${esc(r.name)}</strong><span>Départ ${new Date(r.startedAt).toLocaleTimeString('fr-FR')}</span></div><strong>${arr}/${p.length}</strong></div>`}).join(''):'<p class="empty">Aucune course démarrée.</p>'}</div></div></section>`;
  }

  function renderResults(){
    const groups=buildGroups(), finished=state.students.filter(s=>s.elapsedMs!=null).length;
    return `<section class="page-grid"><div class="card span-2"><div class="card-head"><div><h2>Résultats</h2><p>${finished} élèves classés. Un élève est considéré présent lorsqu’une arrivée a été enregistrée.</p></div></div><div class="actions"><button class="button primary" id="excel" ${finished?'':'disabled'}>Exporter Excel</button><button class="button" id="results-pdf" ${finished?'':'disabled'}>Exporter PDF</button></div></div>
      <div class="card table-card"><h3>Classement des classes</h3><table><thead><tr><th>Niveau</th><th>Rang</th><th>Classe</th><th>Présents</th><th>Moyenne</th></tr></thead><tbody>${groups.classAverages.map(r=>`<tr><td>${esc(r.level)}</td><td>${r.rank}</td><td>${esc(r.className)}</td><td>${r.count}</td><td>${r.average}</td></tr>`).join('')}</tbody></table></div>
      <div class="card table-card"><h3>Classement des enseignants</h3><table><thead><tr><th>Rang</th><th>Enseignant</th><th>Élèves</th><th>Moyenne</th></tr></thead><tbody>${groups.teacherAverages.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.teacher)}</td><td>${r.count}</td><td>${r.average}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function renderManualModal(){
    const q=manualSearch.trim().toLowerCase();
    const candidates=state.students.filter(s=>{
      if(s.elapsedMs!=null||!s.raceId||!raceById(s.raceId)?.startedAt) return false;
      if(!q) return true;
      return String(s.bib).includes(q)||displayName(s).toLowerCase().includes(q)||String(s.className).toLowerCase().includes(q);
    }).slice(0,30);
    return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><h2>Arrivée sans dossard</h2><p>Heure figée à ${new Date(manualStamp).toLocaleTimeString('fr-FR')}.</p></div><button class="close" id="close-modal">×</button></div><input class="manual-search" id="manual-search" autofocus value="${esc(manualSearch)}" placeholder="Nom, 3 premières lettres, classe ou n° de dossard"><div class="candidate-list">${candidates.map(s=>`<button data-manual-student="${s.id}"><strong>#${s.bib}</strong><span>${esc(displayName(s))} · ${esc(s.className)}</span><small>${esc(raceById(s.raceId)?.name||'')}</small></button>`).join('')}</div></div></div>`;
  }

  function bind(){
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;save();render()});
    $('#student-file')?.addEventListener('change', e=>handleImport(e.target.files?.[0]));
    $('#demo')?.addEventListener('click', loadDemo);
    $('#template')?.addEventListener('click', downloadTemplate);
    $('#bibs')?.addEventListener('click', exportBibsPdf);
    $('#backup')?.addEventListener('click', exportBackup);
    document.querySelectorAll('.chip').forEach(b=>b.onclick=()=>b.classList.toggle('selected'));
    $('#create-race')?.addEventListener('click', createRace);
    document.querySelectorAll('[data-delete-race]').forEach(b=>b.onclick=()=>deleteRace(b.dataset.deleteRace));
    document.querySelectorAll('[data-start-race]').forEach(b=>b.onclick=()=>startRace(b.dataset.startRace));
    $('#no-bib')?.addEventListener('click', ()=>{manualStamp=Date.now();manualSearch='';render(); setTimeout(()=>$('#manual-search')?.focus(),50)});
    $('#undo')?.addEventListener('click', undoLast);
    $('#test-scan')?.addEventListener('click', ()=>setNotice('Scanne maintenant un dossard : le code doit apparaître ici.'));
    $('#excel')?.addEventListener('click', exportExcel);
    $('#results-pdf')?.addEventListener('click', exportResultsPdf);
    $('#close-modal')?.addEventListener('click', ()=>{manualStamp=null;manualSearch='';render()});
    $('#manual-search')?.addEventListener('input', e=>{manualSearch=e.target.value;render(); setTimeout(()=>{const x=$('#manual-search'); if(x){x.focus();x.setSelectionRange(x.value.length,x.value.length)}},0)});
    document.querySelectorAll('[data-manual-student]').forEach(b=>b.onclick=()=>chooseManual(b.dataset.manualStudent));
  }

  async function handleImport(file){
    if(!file) return;
    try{
      let rows=[];
      if(file.name.toLowerCase().endsWith('.csv')){
        const text=await file.text(); rows=parseCsv(text);
      } else {
        if(!window.XLSX) throw new Error('Le module Excel n’est pas chargé. Ouvre une fois l’application avec Internet puis réessaie.');
        const data=await file.arrayBuffer(), wb=XLSX.read(data), ws=wb.Sheets[wb.SheetNames[0]];
        rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      }
      const parsed=rows.map((row,index)=>{
        const lastName=String(pick(row,['nom','lastname','name'])).trim();
        const firstName=String(pick(row,['prenom','prénom','firstname'])).trim();
        const className=String(pick(row,['classe','class','classname'])).trim();
        const levelRaw=String(pick(row,['niveau','level'])).trim();
        const teacher=String(pick(row,['enseignant','professeur','professeurprincipal','pp','teacher'])).trim();
        const sex=normalizeSex(pick(row,['sexe','genre','sex']));
        const bibRaw=Number(pick(row,['dossard','numero','numéro','bib']));
        return {id:uid(),lastName,firstName,className,level:deriveLevel(className,levelRaw),sex,teacher,bib:Number.isFinite(bibRaw)&&bibRaw>0?bibRaw:index+1};
      }).filter(s=>s.lastName&&s.className);
      if(!parsed.length) throw new Error('Aucun élève détecté. Il faut au minimum les colonnes Nom et Classe.');
      const used=new Set();let next=1;for(const s of parsed){if(used.has(s.bib)){while(used.has(next))next++;s.bib=next}used.add(s.bib);while(used.has(next))next++}
      if(state.students.length&&!confirm(`Remplacer les ${state.students.length} élèves déjà enregistrés ? Les courses et chronos seront remis à zéro.`)) return;
      state={...initial,students:parsed,notice:`${parsed.length} élèves importés`};save();render();
    }catch(err){setNotice(err?.message||'Import impossible')}
  }

  function parseCsv(text){
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean); if(!lines.length)return[];
    const sep=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';
    const split=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(c===sep&&!q){out.push(cur);cur=''}else cur+=c}out.push(cur);return out};
    const headers=split(lines[0]);return lines.slice(1).map(line=>{const vals=split(line),o={};headers.forEach((h,i)=>o[h]=vals[i]??'');return o});
  }

  function downloadTemplate(){
    downloadBlob('\uFEFFNom;Prénom;Classe;Niveau;Sexe;Enseignant;Dossard\nDUPONT;Lina;6A;6e;F;Mme Martin;1\nMARTIN;Noé;6A;6e;M;Mme Martin;2\n','modele-eleves-cross.csv','text/csv;charset=utf-8');
  }


  function loadDemo(){
    if(state.students.length && !confirm('Remplacer les données actuelles par les élèves de démonstration ?')) return;
    const students = DEMO_STUDENTS.map(([bib,lastName,firstName,className,level,sex,teacher])=>({
      id: uid(), bib, lastName, firstName, className, level, sex, teacher
    }));
    const race6 = {id:uid(),name:'Démo 6e',levels:['6e'],sexes:['F','M'],createdAt:Date.now()};
    const race5 = {id:uid(),name:'Démo 5e',levels:['5e'],sexes:['F','M'],createdAt:Date.now()};
    students.forEach(s=>{
      if(s.level==='6e') s.raceId=race6.id;
      if(s.level==='5e') s.raceId=race5.id;
    });
    race6.participantIds=students.filter(s=>s.raceId===race6.id).map(s=>s.id);
    race5.participantIds=students.filter(s=>s.raceId===race5.id).map(s=>s.id);
    state={...initial,students,races:[race6,race5],notice:'Démo chargée : dossards 101 à 112. Lance une course puis scanne.'};
    save();render();
  }

  function createRace(){
    const name=$('#race-name')?.value.trim(), lv=selectedLevelsFromForm(), sx=selectedSexesFromForm();
    if(!name)return setNotice('Donne un nom à la course'); if(!lv.length||!sx.length)return setNotice('Sélectionne au moins un niveau et un sexe');
    const participants=state.students.filter(s=>!s.raceId&&lv.includes(s.level)&&sx.includes(s.sex)); if(!participants.length)return setNotice('Aucun élève disponible pour ces critères');
    const race={id:uid(),name,levels:lv,sexes:sx,participantIds:participants.map(s=>s.id),createdAt:Date.now()};state.races.push(race);participants.forEach(s=>s.raceId=race.id);state.notice=`${name} créée : ${participants.length} élèves`;save();render();
  }
  function deleteRace(id){const r=raceById(id);if(!r||r.startedAt)return;if(!confirm(`Supprimer « ${r.name} » ?`))return;state.students.forEach(s=>{if(s.raceId===id)delete s.raceId});state.races=state.races.filter(x=>x.id!==id);save();render()}
  function startRace(id){const r=raceById(id);if(!r||r.startedAt)return;if(!confirm(`Lancer maintenant « ${r.name} » ?`))returip" data-level="${esc(l)}">${esc(l)}</button>`).join('')}</div></div>
      <div class="field"><span>Sexe</span><div class="chip-row"><button class="chip" data-sex="F">Filles</button><button class="chip" data-sex="M">Garçons</button><button class="chip" data-sex="X">Non renseigné</button></div></div>
      <button class="button primary full" id="create-race">Créer et affecter les élèves</button></div>
      <div class="card"><h2>Courses</h2><div class="race-list">${state.races.length?state.races.map(r=>{
        const participants=state.students.filter(s=>s.raceId===r.id), arrived=participants.filter(s=>s.elapsedMs!=null).length;
        return `<div class="race-row"><div><strong>${esc(r.name)}</strong><span>${participants.length} élèves · ${r.levels.map(esc).join(', ')} · ${r.sexes.join('/')}</span>${r.startedAt?`<span>Démarrée à ${new Date(r.startedAt).toLocaleTimeString('fr-FR')}</span>`:''}</div><div class="race-actions">${r.startedAt?`<span class="started">${arrived}/${participants.length} arrivés</span>`:`<button class="button danger-ghost" data-delete-race="${r.id}">Supprimer</button><button class="button start" data-start-race="${r.id}">DÉPART</button>`}</div></div>`;
      }).join(''):'<p class="empty">Aucune course créée.</p>'}</div></div></section>`;
  }

  function renderTiming(){
    const active=state.races.filter(r=>r.startedAt!=null);
    const pending=state.students.filter(s=>s.raceId && raceById(s.raceId)?.startedAt && s.elapsedMs==null).length;
    const finished=state.students.filter(s=>s.elapsedMs!=null).length;
    return `<section class="timing-layout"><div class="card timing-main"><div class="timing-title"><div><h2>Arrivées</h2><p>Scanne un dossard : le temps est enregistré immédiatement.</p></div><div class="live-dot">● SCANNER</div></div>
      <div class="big-notice">${esc(state.notice)}</div><div class="timing-stats"><div><strong>${active.length}</strong><span>courses démarrées</span><div><strong>${pending}</strong><span>élèves encore en course</span></div><div><strong>${finished}</strong><span>arrivées enregistrées</span></div></div>
      <div class="actions giant-actions"><button class="button warning" id="no-bib">SANS DOSSARD</button><button class="button" id="undo">Annuler la dernière arrivée</button><button class="button" id="test-scan">Tester le scanner</button></div>
      <p class="hint">Dernier code reçu : <strong>${esc(state.lastScan||'aucun')}</strong>. Le lecteur doit être jumelé à l’iPad en Bluetooth HID et envoyer Entrée après le code.</p></div>
      <div class="card"><h2>Courses actives</h2><div class="race-list">${active.length?active.map(r=>{const p=state.students.filter(s=>s.raceId===r.id),arr=p.filter(s=>s.elapsedMs!=null).length;return `<div class="race-row compact"><div><strong>${esc(r.name)}</strong><span>Départ ${new Date(r.startedAt).toLocaleTimeString('fr-FR')}</span></div><strong>${arr}/${p.length}</strong></div>`}).join(''):'<p class="empty">Aucune course démarrée.</p>'}</div></div></section>`;
  }

  function renderResults(){
    const groups=buildGroups(), finished=state.students.filter(s=>s.elapsedMs!=null).length;
    return `<section class="page-grid"><div class="card span-2"><div class="card-head"><div><h2>Résultats</h2><p>${finished} élèves classés. Un élève est considéré présent lorsqu’une arrivée a été enregistrée.</p></div></div><div class="actions"><button class="button primary" id="excel" ${finished?'':'disabled'}>Exporter Excel</button><button class="button" id="results-pdf" ${finished?'':'disabled'}>Exporter PDF</button></div></div>
      <div class="card table-card"><h3>Classement des classes</h3><table><thead><tr><th>Niveau</th><th>Rang</th><th>Classe</th><th>Présents</th><th>Moyenne</th></tr></thead><tbody>${groups.classAverages.map(r=>`<tr><td>${esc(r.level)}</td><td>${r.rank}</td><td>${esc(r.className)}</td><td>${r.count}</td><td>${r.average}</td></tr>`).join('')}</tbody></table></div>
      <div class="card table-card"><h3>Classement des enseignants</h3><table><thead><tr><th>Rang</th><th>Enseignant</th><th>Élèves</th><th>Moyenne</th></tr></thead><tbody>${groups.teacherAverages.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.teacher)}</td><td>${r.count}</td><td>${r.average}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function renderManualModal(){
    const q=manualSearch.trim().toLowerCase();
    const candidates=state.students.filter(s=>{
      if(s.elapsedMs!=null||!s.raceId||!raceById(s.raceId)?.startedAt) return false;
      if(!q) return true;
      return String(s.bib).includes(q)||displayName(s).toLowerCase().includes(q)||String(s.className).toLowerCase().includes(q);
    }).slice(0,30);
    return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><h2>Arrivée sans dossard</h2><p>Heure figée à ${new Date(manualStamp).toLocaleTimeString('fr-FR')}.</p></div><button class="close" id="close-modal">×</button></div><input class="manual-search" id="manual-search" autofocus value="${esc(manualSearch)}" placeholder="Nom, 3 premières lettres, classe ou n° de dossard"><div class="candidate-list">${candidates.map(s=>`<button data-manual-student="${s.id}"><strong>#${s.bib}</strong><span>${esc(displayName(s))} · ${esc(s.className)}</span><small>${esc(raceById(s.raceId)?.name||'')}</small></button>`).join('')}</div></div></div>`;
  }

  function bind(){
    document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;save();render()});
    $('#student-file')?.addEventListener('change', e=>handleImport(e.target.files?.[0]));
    $('#demo')?.addEventListener('click', loadDemo);
    $('#template')?.addEventListener('click', downloadTemplate);
    $('#bibs')?.addEventListener('click', exportBibsPdf);
    $('#backup')?.addEventListener('click', exportBackup);
    document.querySelectorAll('.chip').forEach(b=>b.onclick=()=>b.classList.toggle('selected'));
    $('#create-race')?.addEventListener('click', createRace);
    document.querySelectorAll('[data-delete-race]').forEach(b=>b.onclick=()=>deleteRace(b.dataset.deleteRace));
    document.querySelectorAll('[data-start-race]').forEach(b=>b.onclick=()=>startRace(b.dataset.startRace));
    $('#no-bib')?.addEventListener('click', ()=>{manualStamp=Date.now();manualSearch='';render(); setTimeout(()=>$('#manual-search')?.focus(),50)});
    $('#undo')?.addEventListener('click', undoLast);
    $('#test-scan')?.addEventListener('click', ()=>setNotice('Scanne maintenant un dossard : le code doit apparaître ici.'));
    $('#excel')?.addEventListener('click', exportExcel);
    $('#results-pdf')?.addEventListener('click', exportResultsPdf);
    $('#close-modal')?.addEventListener('click', ()=>{manualStamp=null;manualSearch='';render()});
    $('#manual-search')?.addEventListener('input', e=>{manualSearch=e.target.value;render(); setTimeout(()=>{const x=$('#manual-search'); if(x){x.focus();x.setSelectionRange(x.value.length,x.value.length)}},0)});
    document.querySelectorAll('[data-manual-student]').forEach(b=>b.onclick=()=>chooseManual(b.dataset.manualStudent));
  }

  async function handleImport(file){
    if(!file) return;
    try{
      let rows=[];
      if(file.name.toLowerCase().endsWith('.csv')){
        const text=await file.text(); rows=parseCsv(text);
      } else {
        if(!window.XLSX) throw new Error('Le module Excel n’est pas chargé. Ouvre une fois l’application avec Internet puis réessaie.');
        const data=await file.arrayBuffer(), wb=XLSX.read(data), ws=wb.Sheets[wb.SheetNames[0]];
        rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      }
      const parsed=rows.map((row,index)=>{
        const lastName=String(pick(row,['nom','lastname','name'])).trim();
        const firstName=String(pick(row,['prenom','prénom','firstname'])).trim();
        const className=String(pick(row,['classe','class','classname'])).trim();
        const levelRaw=String(pick(row,['niveau','level'])).trim();
        const teacher=String(pick(row,['enseignant','professeur','professeurprincipal','pp','teacher'])).trim();
        const sex=normalizeSex(pick(row,['sexe','genre','sex']));
        const bibRaw=Number(pick(row,['dossard','numero','numéro','bib']));
        return {id:uid(),lastName,firstName,className,level:deriveLevel(className,levelRaw),sex,teacher,bib:Number.isFinite(bibRaw)&&bibRaw>0?bibRaw:index+1};
      }).filter(s=>s.lastName&&s.className);
      if(!parsed.length) throw new Error('Aucun élève détecté. Il faut au minimum les colonnes Nom et Classe.');
      const used=new Set();let next=1;for(const s of parsed){if(used.has(s.bib)){while(used.has(next))next++;s.bib=next}used.add(s.bib);while(used.has(next))next++}
      if(state.students.length&&!confirm(`Remplacer les ${state.students.length} élèves déjà enregistrés ? Les courses et chronos seront remis à zéro.`)) return;
      state={...initial,students:parsed,notice:`${parsed.length} élèves importés`};save();render();
    }catch(err){setNotice(err?.message||'Import impossible')}
  }

  function parseCsv(text){
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean); if(!lines.length)return[];
    const sep=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';
    const split=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(c===sep&&!q){out.push(cur);cur=''}else cur+=c}out.push(cur);return out};
    const headers=split(lines[0]);return lines.slice(1).map(line=>{const vals=split(line),o={};headers.forEach((h,i)=>o[h]=vals[i]??'');return o});
  }

  function downloadTemplate(){
    downloadBlob('\uFEFFNom;Prénom;Classe;Niveau;Sexe;Enseignant;Dossard\nDUPONT;Lina;6A;6e;F;Mme Martin;1\nMARTIN;Noé;6A;6e;M;Mme Martin;2\n','modele-eleves-cross.csv','text/csv;charset=utf-8');
  }


  function loadDemo(){
    if(state.students.length && !confirm('Remplacer les données actuelles par les élèves de démonstration ?')) return;
    const students = DEMO_STUDENTS.map(([bib,lastName,firstName,className,level,sex,teacher])=>({
      id: uid(), bib, lastName, firstName, className, level, sex, teacher
    }));
    const race6 = {id:uid(),name:'Démo 6e',levels:['6e'],sexes:['F','M'],createdAt:Date.now()};
    const race5 = {id:uid(),name:'Démo 5e',levels:['5e'],sexes:['F','M'],createdAt:Date.now()};
    students.forEach(s=>{
      if(s.level==='6e') s.raceId=race6.id;
      if(s.level==='5e') s.raceId=race5.id;
    });
    race6.participantIds=students.filter(s=>s.raceId===race6.id).map(s=>s.id);
    race5.participantIds=students.filter(s=>s.raceId===race5.id).map(s=>s.id);
    state={...initial,students,races:[race6,race5],notice:'Démo chargée : dossards 101 à 112. Lance une course puis scanne.'};
    save();render();
  }

  function createRace(){
    const name=$('#race-name')?.value.trim(), lv=selectedLevelsFromForm(), sx=selectedSexesFromForm();
    if(!name)return setNotice('Donne un nom à la course'); if(!lv.length||!sx.length)return setNotice('Sélectionne au moins un niveau et un sexe');
    const participants=state.students.filter(s=>!s.raceId&&lv.includes(s.level)&&sx.includes(s.sex)); if(!participants.length)return setNotice('Aucun élève disponible pour ces critères');
    const race={id:uid(),name,levels:lv,sexes:sx,participantIds:participants.map(s=>s.id),createdAt:Date.now()};state.races.push(race);participants.forEach(s=>s.raceId=race.id);state.notice=`${name} créée : ${participants.length} élèves`;save();render();
  }
  function deleteRace(id){const r=raceById(id);if(!r||r.startedAt)return;if(!confirm(`Supprimer « ${r.name} » ?`))return;state.students.forEach(s=>{if(s.raceId===id)delete s.raceId});state.races=state.races.filter(x=>x.id!==id);save();render()}
  function startRace(id){const r=raceById(id);if(!r||r.startedAt)return;if(!confirm(`Lancer maintenant « ${r.name} » ?`))returener('click', createRace);
    document.querySelectorAll('[data-delete-race]').forEach(b=>b.onclick=()=>deleteRace(b.dataset.deleteRace));
    document.querySelectorAll('[data-start-race]').forEach(b=>b.onclick=()=>startRace(b.dataset.startRace));
    $('#no-bib')?.addEventListener('click', ()=>{manualStamp=Date.now();manualSearch='';render(); setTimeout(()=>$('#manual-search')?.focus(),50)});
    $('#undo')?.addEventListener('click', undoLast);
    $('#test-scan')?.addEventListener('click', ()=>setNotice('Scanne maintenant un dossard : le code doit apparaître ici.'));
    $('#excel')?.addEventListener('click', exportExcel);
    $('#results-pdf')?.addEventListener('click', exportResultsPdf);
    $('#close-modal')?.addEventListener('click', ()=>{manualStamp=null;manualSearch='';render()});
    $('#manual-search')?.addEventListener('input', e=>{manualSearch=e.target.value;render(); setTimeout(()=>{const x=$('#manual-search'); if(x){x.focus();x.setSelectionRange(x.value.length,x.value.length)}},0)});
    document.querySelectorAll('[data-manual-student]').forEach(b=>b.onclick=()=>chooseManual(b.dataset.manualStudent));
  }

  async function handleImport(file){
    if(!file) return;
    try{
      let rows=[];
      if(file.name.toLowerCase().endsWith('.csv')){
        const text=await file.text(); rows=parseCsv(text);
      } else {
        if(!window.XLSX) throw new Error('Le module Excel n’est pas chargé. Ouvre une fois l’application avec Internet puis réessaie.');
        const data=await file.arrayBuffer(), wb=XLSX.read(data), ws=wb.Sheets[wb.SheetNames[0]];
        rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      }
      const parsed=rows.map((row,index)=>{
        const lastName=String(pick(row,['nom','lastname','name'])).trim();
        const firstName=String(pick(row,['prenom','prénom','firstname'])).trim();
        const className=String(pick(row,['classe','class','classname'])).trim();
        const levelRaw=String(pick(row,['niveau','level'])).trim();
        const teacher=String(pick(row,['enseignant','professeur','professeurprincipal','pp','teacher'])).trim();
        const sex=normalizeSex(pick(row,['sexe','genre','sex']));
        const bibRaw=Number(pick(row,['dossard','numero','numéro','bib']));
        return {id:uid(),lastName,firstName,className,level:deriveLevel(className,levelRaw),sex,teacher,bib:Number.isFinite(bibRaw)&&bibRaw>0?bibRaw:index+1};
      }).filter(s=>s.lastName&&s.className);
      if(!parsed.length) throw new Error('Aucun élève détecté. Il faut au minimum les colonnes Nom et Classe.');
      const used=new Set();let next=1;for(const s of parsed){if(used.has(s.bib)){while(used.has(next))next++;s.bib=next}used.add(s.bib);while(used.has(next))next++}
      if(state.students.length&&!confirm(`Remplacer les ${state.students.length} élèves déjà enregistrés ? Les courses et chronos seront remis à zéro.`)) return;
      state={...initial,students:parsed,notice:`${parsed.length} élèves importés`};save();render();
    }catch(err){setNotice(err?.message||'Import impossible')}
  }

  function parseCsv(text){
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean); if(!lines.length)return[];
    const sep=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';
    const split=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(c===sep&&!q){out.push(cur);cur=''}else cur+=c}out.push(cur);return out};
    const headers=split(lines[0]);return lines.slice(1).map(line=>{const vals=split(line),o={};headers.forEach((h,i)=>o[h]=vals[i]??'');return o});
  }

  function downloadTemplate(){
    downloadBlob('\uFEFFNom;Prénom;Classe;Niveau;Sexe;Enseignant;Dossard\nDUPONT;Lina;6A;6e;F;Mme Martin;1\nMARTIN;Noé;6A;6e;M;Mme Martin;2\n','modele-eleves-cross.csv','text/csv;charset=utf-8');
  }


  function loadDemo(){
    if(state.students.length && !confirm('Remplacer les données actuelles par les élèves de démonstration ?')) return;
    const students = DEMO_STUDENTS.map(([bib,lastName,firstName,className,level,sex,teacher])=>({
      id: uid(), bib, lastName, firstName, className, level, sex, teacher
    }));
    const race6 = {id:uid(),name:'Démo 6e',levels:['6e'],sexes:['F','M'],createdAt:Date.now()};
    const race5 = {id:uid(),name:'Démo 5e',levels:['5e'],sexes:['F','M'],createdAt:Date.now()};
    students.forEach(s=>{
      if(s.level==='6e') s.raceId=race6.id;
      if(s.level==='5e') s.raceId=race5.id;
    });
    race6.participantIds=students.filter(s=>s.raceId===race6.id).map(s=>s.id);
    race5.participantIds=students.filter(s=>s.raceId===race5.id).map(s=>s.id);
    state={...initial,students,races:[race6,race5],notice:'Démo chargée : dossards 101 à 112. Lance une course puis scanne.'};
    save();render();
  }

  function createRace(){
    const name=$('#race-name')?.value.trim(), lv=selectedLevelsFromForm(), sx=selectedSexesFromForm();
    if(!name)return setNotice('Donne un nom à la course'); if(!lv.length||!sx.length)return setNotice('Sélectionne au moins un niveau et un sexe');
    const participants=state.students.filter(s=>!s.raceId&&lv.includes(s.level)&&sx.includes(s.sex)); if(!participants.length)return setNotice('Aucun élève disponible pour ces critères');
    const race={id:uid(),name,levels:lv,sexes:sx,participantIds:participants.map(s=>s.id),createdAt:Date.now()};state.races.push(race);participants.forEach(s=>s.raceId=race.id);state.notice=`${name} créée : ${participants.length} élèves`;save();render();
  }
  function deleteRace(id){const r=raceById(id);if(!r||r.startedAt)return;if(!confirm(`Supprimer « ${r.name} » ?`))return;state.students.forEach(s=>{if(s.raceId===id)delete s.raceId});state.races=state.races.filter(x=>x.id!==id);save();render()}
  function startRace(id){const r=raceById(id);if(!r||r.startedAt)return;if(!confirm(`Lancer maintenant « ${r.name} » ?`))return;r.startedAt=Date.now();state.notice=`${r.name} lancée`;state.tab='timing';save();render()}

  function normalizeBibInput(raw){const s=String(raw).trim().replace(/^D/i,'');return /^\d+$/.test(s)?Number(s):null}
  function finishStudent(student,finishedAt,method){
    if(student.elapsedMs!=null)return setNotice(`${displayName(student)} est déjà arrivé en ${formatElapsed(student.elapsedMs)}`);
    if(!student.raceId)return setNotice(`${displayName(student)} n'est affecté à aucune course`);const race=raceById(student.raceId);if(!race?.startedAt)return setNotice(`La course de ${displayName(student)} n'a pas démarré`);
    const elapsedMs=Math.max(0,finishedAt-race.startedAt);student.finishedAt=finishedAt;student.elapsedMs=elapsedMs;state.finishes.push({id:uid(),studentId:student.id,raceId:race.id,finishedAt,elapsedMs,method});state.notice=`#${student.bib} ${displayName(student)} — ${formatElapsed(elapsedMs)}`;save();render();
  }
  function handleScan(raw){state.lastScan=raw;const bib=normalizeBibInput(raw);if(bib==null)return setNotice(`Code non reconnu : ${raw}`);const student=state.students.find(s=>s.bib===bib);if(!student)return setNotice(`Dossard ${raw} inconnu`);finishStudent(student,Date.now(),'scan')}
  function chooseManual(id){const s=state.students.find(x=>x.id===id);if(!s||manualStamp==null)return;const stamp=manualStamp;manualStamp=null;manualSearch='';finishStudent(s,stamp,'manual')}
  function undoLast(){const last=state.finishes[state.finishes.length-1];if(!last)return setNotice('Aucune arrivée à annuler');const s=state.students.find(x=>x.id===last.studentId);if(s){delete s.finishedAt;delete s.elapsedMs;state.notice=`Arrivée annulée : #${s.bib} ${displayName(s)}`};state.finishes.pop();save();render()}

  function buildGroups(){
    const finished=state.students.filter(s=>s.elapsedMs!=null), individual=[], byClass=[], classAverages=[], teacherAverages=[];
    const im=new Map();finished.forEach(s=>{const k=`${s.level}|${s.sex}`;(im.get(k)||im.set(k,[]).get(k)).push(s)});[...im.entries()].sort().forEach(([k,a])=>{const[level,sex]=k.split('|');a.sort((x,y)=>x.elapsedMs-y.elapsedMs);a.forEach((s,i)=>individual.push({level,sex,rank:i+1,bib:s.bib,name:displayName(s),className:s.className,time:formatElapsed(s.elapsedMs),elapsedMs:s.elapsedMs}))});
    const cm=new Map();finished.forEach(s=>{const a=cm.get(s.className)||[];a.push(s);cm.set(s.className,a)});[...cm.entries()].sort().forEach(([className,a])=>{a.sort((x,y)=>x.elapsedMs-y.elapsedMs);a.forEach((s,i)=>byClass.push({className,rank:i+1,bib:s.bib,name:displayName(s),sex:s.sex,time:formatElapsed(s.elapsedMs),elapsedMs:s.elapsedMs}))});
    const lc=new Map();finished.forEach(s=>{const k=`${s.level}|${s.className}`,a=lc.get(k)||[];a.push(s);lc.set(k,a)});const lb=new Map();for(const[k,a]of lc){const[level,className]=k.split('|'),avg=mean(a.map(s=>s.elapsedMs)),b=lb.get(level)||[];b.push({className,count:a.length,averageMs:avg});lb.set(level,b)};[...lb.entries()].sort().forEach(([level,b])=>{b.sort((x,y)=>x.averageMs-y.averageMs);b.forEach((x,i)=>classAverages.push({level,rank:i+1,className:x.className,count:x.count,average:formatElapsed(x.averageMs),averageMs:x.averageMs}))});
    const tm=new Map();finished.filter(s=>s.teacher).forEach(s=>{const a=tm.get(s.teacher)||[];a.push(s);tm.set(s.teacher,a)});[...tm.entries()].map(([teacher,a])=>({teacher,count:a.length,averageMs:mean(a.map(s=>s.elapsedMs))})).sort((a,b)=>a.averageMs-b.averageMs).forEach((x,i)=>teacherAverages.push({...x,rank:i+1,average:formatElapsed(x.averageMs)}));
    return {individual,byClass,classAverages,teacherAverages};
  }

  function exportExcel(){
    const g=buildGroups();
    if(window.XLSX){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.individual.map(r=>({Niveau:r.level,Sexe:r.sex,Rang:r.rank,Dossard:r.bib,Élève:r.name,Classe:r.className,Temps:r.time}))),'Niveau-Sexe');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.byClass.map(r=>({Classe:r.className,Rang:r.rank,Dossard:r.bib,Élève:r.name,Sexe:r.sex,Temps:r.time}))),'Par classe');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.classAverages.map(r=>({Niveau:r.level,Rang:r.rank,Classe:r.className,Présents:r.count,'Temps moyen':r.average}))),'Classement classes');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.teacherAverages.map(r=>({Rang:r.rank,Enseignant:r.teacher,Élèves:r.count,'Temps moyen':r.average}))),'Enseignants');XLSX.writeFile(wb,'resultats-cross.xlsx');return}
    const rows=[['Niveau','Sexe','Rang','Dossard','Élève','Classe','Temps'],...g.individual.map(r=>[r.level,r.sex,r.rank,r.bib,r.name,r.className,r.time])];downloadBlob('\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\n'),'resultats-cross.csv','text/csv;charset=utf-8');
  }
  const csvCell=v=>`"${String(v??'').replace(/"/g,'""')}"`;

  function exportResultsPdf(){
    const g=buildGroups(); if(!window.jspdf?.jsPDF)return printResults(g); const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});let first=true;
    const section=(title,head,body)=>{if(!first)doc.addPage();first=false;doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text(title,14,18);if(typeof doc.autoTable==='function')doc.autoTable({head:[head],body,startY:24,styles:{fontSize:8},headStyles:{fillColor:[15,23,42]}});else{doc.setFontSize(8);doc.text(body.slice(0,40).map(r=>r.join(' | ')),14,28)}};
    section('Classement par niveau et sexe',['Niveau','Sexe','Rang','Dossard','Élève','Classe','Temps'],g.individual.map(r=>[r.level,r.sex,r.rank,r.bib,r.name,r.className,r.time]));section('Classement par classe',['Classe','Rang','Dossard','Élève','Sexe','Temps'],g.byClass.map(r=>[r.className,r.rank,r.bib,r.name,r.sex,r.time]));section('Classement des classes par niveau',['Niveau','Rang','Classe','Présents','Temps moyen'],g.classAverages.map(r=>[r.level,r.rank,r.className,r.count,r.average]));section('Classement des enseignants',['Rang','Enseignant','Élèves','Temps moyen'],g.teacherAverages.map(r=>[r.rank,r.teacher,r.count,r.average]));doc.save('resultats-cross.pdf');
  }

  function printResults(g){
    const w=window.open('','_blank'); if(!w)return; const table=(title,head,rows)=>`<h2>${title}</h2><table><thead><tr>${head.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;w.document.write(`<html><head><title>Résultats cross</title><style>body{font-family:Arial;padding:20px}table{border-collapse:collapse;width:100%;margin-bottom:30px}th,td{border:1px solid #bbb;padding:5px;font-size:11px}h2{page-break-before:always}h2:first-child{page-break-before:auto}</style></head><body>${table('Classement par niveau et sexe',['Niveau','Sexe','Rang','Dossard','Élève','Classe','Temps'],g.individual.map(r=>[r.level,r.sex,r.rank,r.bib,r.name,r.className,r.time]))}${table('Classement par classe',['Classe','Rang','Dossard','Élève','Sexe','Temps'],g.byClass.map(r=>[r.className,r.rank,r.bib,r.name,r.sex,r.time]))}${table('Classement des classes',['Niveau','Rang','Classe','Présents','Moyenne'],g.classAverages.map(r=>[r.level,r.rank,r.className,r.count,r.average]))}${table('Classement des enseignants',['Rang','Enseignant','Élèves','Moyenne'],g.teacherAverages.map(r=>[r.rank,r.teacher,r.count,r.average]))}</body></html>`);w.document.close();setTimeout(()=>w.print(),300);
  }

  function exportBibsPdf(){
    if(window.jspdf?.jsPDF && window.JsBarcode){const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'}),cardW=95,cardH=138,mx=7.5,my=8;state.students.forEach((s,i)=>{if(i>0&&i%4===0)doc.addPage();const slot=i%4,col=slot%2,row=Math.floor(slot/2),x=mx+col*cardW,y=my+row*cardH;doc.setDrawColor(190);doc.rect(x,y,cardW-2,cardH-2);doc.setFont('helvetica','bold');doc.setFontSize(40);doc.text(String(s.bib),x+(cardW-2)/2,y+24,{align:'center'});doc.setFontSize(12);doc.text(displayName(s).slice(0,30),x+(cardW-2)/2,y+36,{align:'center'});doc.setFontSize(11);doc.text(`${s.className} · ${s.sex}`,x+(cardW-2)/2,y+44,{align:'center'});const c=document.createElement('canvas');JsBarcode(c,padBib(s.bib),{format:'CODE128',displayValue:true,fontSize:18,height:70,margin:4,width:2});doc.addImage(c.toDataURL('image/png'),'PNG',x+8,y+56,cardW-18,45);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('Cross du collège',x+(cardW-2)/2,y+126,{align:'center'})});doc.save('dossards-cross.pdf');return}
    printBibs();
  }

  function printBibs(){const w=window.open('','_blank');if(!w)return;w.document.write(`<html><head><title>Dossards</title><style>@page{size:A4;margin:8mm}body{margin:0;font-family:Arial}.grid{display:grid;grid-template-columns:1fr 1fr}.bib{height:135mm;border:1px dashed #aaa;text-align:center;padding:8mm;break-inside:avoid}.num{font-size:60px;font-weight:bold}.name{font-size:22px;font-weight:bold}.cls{font-size:18px;margin-top:8px}</style></head><body><div class="grid">${state.students.map(s=>`<div class="bib"><div class="num">${s.bib}</div><div class="name">${esc(displayName(s))}</div><div class="cls">${esc(s.className)} · ${s.sex}</div><p>Code-barres indisponible hors module : reconnecte Internet une fois puis relance.</p></div>`).join('')}</div></body></html>`);w.document.close();setTimeout(()=>w.print(),300)}

  function exportBackup(){downloadBlob(JSON.stringify(state,null,2),'sauvegarde-cross.json','application/json')}
  function downloadBlob(content,name,type){const blob=new Blob([content],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

  document.addEventListener('keydown', e=>{
    if(state.tab!=='timing'||manualStamp!=null)return;const t=e.target;if(t&&['INPUT','TEXTAREA','SELECT'].includes(t.tagName))return;const now=performance.now();if(now-scannerLast>180)scannerBuffer='';scannerLast=now;if(e.key==='Enter'||e.key==='Tab'){const code=scannerBuffer.trim();scannerBuffer='';if(code){e.preventDefault();handleScan(code)}return}if(e.key.length===1&&!e.metaKey&&!e.ctrlKey&&!e.altKey)scannerBuffer+=e.key;
  },true);

  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  render();
})();
