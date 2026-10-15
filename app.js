(() => {
  'use strict';

  const STORAGE_KEY = 'cross-college-state-v2';
  const EMPTY = { students: [], races: [], arrivals: [], classTeachers: {}, crossDistanceM: 0, scannerSeen: false, scannerLastAt: 0, tab: 'students', notice: 'Prêt', noticeKind: 'info', lastScan: '', resultRaceId: '', resultClassName: '', resultMode: 'courses', teacherRankingMode: 'time', manualPending: [] };
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
  let bibClassPickerOpen = false;
  let resultsPdfPickerOpen = false;
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

  function applyRequestedStudentAddition() {
    const update='marla-vidal-6a-2026-10-12';
    if(state.appliedStudentUpdates?.[update]) return false;
    // Mise à jour ciblée de la liste Ada Lovelace, sans ajouter d'élève aux listes de démonstration.
    const matches=(last,first)=>state.students.some(s=>s.className==='6A' && String(s.lastName).toUpperCase()===last && String(s.firstName).toLowerCase()===first);
    if(!matches('BENEZET','julia') || !matches('CHAPUIS','marley')) return false;
    const exists=state.students.some(s=>String(s.lastName).trim().toLowerCase()==='vidal' && String(s.firstName).trim().toLowerCase()==='marla');
    if(!exists){
      const used=new Set(state.students.map(s=>Number(s.bib)));
      let bib=6061; while(used.has(bib)) bib++;
      const race=matchingRaceFor('6e','F');
      state.students.push({id:'student-marla-vidal-6a-2026',lastName:'VIDAL',firstName:'Marla',className:'6A',level:'6e',sex:'F',bib,raceId:race?.id||null});
      state.notice=`Marla VIDAL ajoutée en 6A · dossard #${bib}`;
      state.noticeKind='good';
    }
    state.appliedStudentUpdates={...state.appliedStudentUpdates,[update]:true};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    return !exists;
  }

  function applyRequestedTimeCorrection() {
    const key='4e-boys-plus60-2026-10-14-1254';
    if(state.appliedTimeCorrections?.[key]) return;
    const corrections=[{"id":"41927932-9a61-443a-9e87-e84d60aed749","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":532689,"finishedAt":1791961272417},{"id":"c66a6028-7789-47dd-8bdc-6fe927c8ca7c","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":639120,"finishedAt":1791961378848},{"id":"e47af27f-f417-4aef-bbad-9213bb21e167","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":379841,"finishedAt":1791961119569},{"id":"245de5a6-402d-4558-8686-463ba27d3cda","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":672356,"finishedAt":1791961412084},{"id":"960df190-4d6b-4906-be01-ae2a8289314c","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":608320,"finishedAt":1791961348048},{"id":"5f9aae52-c0fb-49f7-a7dd-f70793ff2efe","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":401948,"finishedAt":1791961141676},{"id":"32d9f9bf-120f-4b34-8a4c-046dd36e766d","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":349843,"finishedAt":1791961089571},{"id":"2569e215-c9a0-4c8d-bf25-b6f06f25a9a2","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":445781,"finishedAt":1791961185509},{"id":"bf784940-ac3c-4ba4-a63a-06dfc7b6f204","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":485202,"finishedAt":1791961224930},{"id":"d98f6457-598c-4fbc-8a0e-bfebc2f0db75","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":447883,"finishedAt":1791961187611},{"id":"f50f4ff4-05ca-46bb-b0cf-65c8c2f1e610","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":570793,"finishedAt":1791961310521},{"id":"3f1f5d66-d2ed-4c66-b9e7-37cf3554f49d","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":415371,"finishedAt":1791961155099},{"id":"269a62d9-ec6d-4a7b-8f17-baa079494b29","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":546387,"finishedAt":1791961286115},{"id":"9160f2a8-77c5-4ad3-a157-dc8b2f4a40a6","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":409994,"finishedAt":1791961149722},{"id":"adee4629-9420-4665-803f-b72bc6d21934","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":372164,"finishedAt":1791961111892},{"id":"639645a7-2634-4f8a-a3b9-46f5421b9372","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":361725,"finishedAt":1791961101453},{"id":"cf749607-8a04-4e1e-b66a-f74cc302e27f","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":327863,"finishedAt":1791961067591},{"id":"0cffa4f5-b6f8-40e2-b26a-eb39a8e0d1b4","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":400689,"finishedAt":1791961140417},{"id":"ea084096-b6c5-46ec-9591-3572d32ef1d5","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":484259,"finishedAt":1791961223987},{"id":"30b8808a-578c-49e5-8fcb-66ac335f0017","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":336927,"finishedAt":1791961076655},{"id":"e0f7ec54-2241-4bbb-a09d-9fae2881e3a7","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":574779,"finishedAt":1791961314507},{"id":"e74731be-a681-431d-91c6-babd449d5c4e","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":450208,"finishedAt":1791961189936},{"id":"67086793-10e8-4ef8-b374-02471a0a90d0","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":488397,"finishedAt":1791961228125},{"id":"1f088ce6-9524-4606-a0ef-c3b3ec81563e","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":393459,"finishedAt":1791961133187},{"id":"12008f93-255d-41d9-9168-ff6421ae6008","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":322811,"finishedAt":1791961062539},{"id":"47bad346-5958-4d46-95ab-929f9eb9e756","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":421200,"finishedAt":1791961160928},{"id":"dc09d4b8-d436-46c2-af19-a6884e03ae5e","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":383754,"finishedAt":1791961123482},{"id":"ebea41dc-5e40-4b20-ad32-bfb0ae8c8300","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":492825,"finishedAt":1791961232553},{"id":"2ef4c8cc-afa5-428c-abe7-4d8f71d762de","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":395560,"finishedAt":1791961135288},{"id":"af2dbde7-9498-4724-aa82-f073dc4d5ad6","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":439344,"finishedAt":1791961179072},{"id":"ef78884c-714a-4a5f-9359-b179f70d021d","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":508092,"finishedAt":1791961247820},{"id":"f2bca6c7-9ba5-43a5-aa2d-de3a7a7e70e7","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":600237,"finishedAt":1791961339965},{"id":"8bf46026-fc2a-4e4b-8072-b5e053672e87","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":375358,"finishedAt":1791961115086},{"id":"9d7dd663-468a-4600-8e73-ab98c1013c27","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":363851,"finishedAt":1791961103579},{"id":"72ee0c8a-0440-4835-b9c7-b2538ed74271","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":433808,"finishedAt":1791961173536},{"id":"142dc493-d173-4e1a-a009-d75e547b5929","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":521123,"finishedAt":1791961260851},{"id":"e32207c1-f897-433b-b9e4-cc29b57bb966","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":506816,"finishedAt":1791961246544},{"id":"bb6eba62-244c-413d-85f2-e3e30518a199","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":311514,"finishedAt":1791961051242},{"id":"e7cb9bd9-481d-4204-9f61-66a97f1dfc84","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":347574,"finishedAt":1791961087302},{"id":"edc1ecda-8f89-4dc8-a376-e9c8e076aabc","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":305109,"finishedAt":1791961044837},{"id":"b32bcddc-2649-40f9-94a3-ee3a94a551e0","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":414037,"finishedAt":1791961153765},{"id":"d3ff7c23-ef33-4c3d-a5b4-c010b32adca4","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":265495,"finishedAt":1791961005223},{"id":"72364d3c-e79c-47ad-84b4-db7734c2bb30","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":344590,"finishedAt":1791961084318},{"id":"d5f1f8f6-e058-433b-a1af-10fa11f9e0f6","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":610934,"finishedAt":1791961350662},{"id":"8d28fd81-cc2a-4ddb-9ae3-d18699f29b30","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":566099,"finishedAt":1791961305827},{"id":"89d03f81-39b1-4d1d-8628-a37996d6ca59","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":700441,"finishedAt":1791961440169},{"id":"7d1342b7-2659-4e0d-b201-8da373e132e1","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":436751,"finishedAt":1791961176479},{"id":"bae1e607-60a7-4d89-a967-05a49fa7d0a8","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":406525,"finishedAt":1791961146253},{"id":"f5928c5a-49f8-45b6-a715-6bdaa3751970","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":530520,"finishedAt":1791961270248},{"id":"1a695765-221b-4787-bb14-3e3ccabc0df0","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":453570,"finishedAt":1791961193298},{"id":"626df0da-6141-4581-9b94-c1f25f686fe0","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":467759,"finishedAt":1791961207487},{"id":"de7cf236-37ac-4a6f-983d-11586390b983","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":346407,"finishedAt":1791961086135},{"id":"feba29b6-c814-4baf-94da-ff6a889fa50e","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":687169,"finishedAt":1791961426897},{"id":"16a6bd24-d5de-49e5-91de-b67a3d864cff","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":567148,"finishedAt":1791961306876},{"id":"bd0cf320-b543-4293-96d5-ed0dc25792d8","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":470428,"finishedAt":1791961210156},{"id":"7be21510-88ce-46fc-90fb-f9c431e0691b","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":690854,"finishedAt":1791961430582},{"id":"b4a549b5-f210-4c14-9198-e32b3a327702","raceId":"5a341544-f0c5-493c-82f6-19da0c2bc73b","elapsedMs":673810,"finishedAt":1791961413538}];
    let found=0,changed=0;
    for(const correction of corrections){
      const student=state.students.find(s=>s.id===correction.id && s.raceId===correction.raceId && s.level==='4e' && s.sex==='M');
      if(!student) continue;
      found++;
      if(student.elapsedMs!==correction.elapsedMs) continue;
      student.elapsedMs+=60000;
      if(Number.isFinite(student.finishedAt)) student.finishedAt+=60000;
      for(const arrival of state.arrivals){
        if(arrival.studentId===student.id && arrival.raceId===student.raceId && arrival.elapsedMs===correction.elapsedMs){
          arrival.elapsedMs+=60000;
          if(Number.isFinite(arrival.stamp)) arrival.stamp+=60000;
          arrival.method='corrected';
        }
      }
      changed++;
    }
    if(!found) return;
    state.appliedTimeCorrections={...state.appliedTimeCorrections,[key]:true};
    if(changed){state.notice=`4e garçons · +1 minute sur ${changed} résultats`;state.noticeKind='good';}
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
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
      ${bibClassPickerOpen ? bibClassPickerModal() : ''}
      ${resultsPdfPickerOpen ? resultsPdfPickerModal() : ''}
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
          <button class="button" id="bibs" ${state.students.length?'':'disabled'}>Dossards par classe</button>
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

      <div class="section-head"><div><h3>Classes</h3><p>Une couleur par niveau. Ouvre une classe pour gérer les élèves et ses professeurs d’EPS (deux maximum).</p></div></div>
      <div class="class-grid">
        ${classNames().map(cls=>{
          const x=classStats(cls), teacher=state.classTeachers?.[cls]?.join(' · ')||'Prof EPS à renseigner';
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
        <div class="card table-card results-main" id="race-results-panel">${selectedRace?`<div class="card-head"><div><h3>${esc(selectedRace.name)}</h3><p>${raceRows.length} classés</p></div><div class="result-actions"><button class="button" data-reopen-result="${selectedRace.id}">Réouvrir</button><button class="button danger-ghost" data-delete-finished="${selectedRace.id}">Supprimer la course</button><button class="button" data-export-race="${selectedRace.id}" ${raceRows.length?'':'disabled'}>PDF course</button><button class="button" data-export-race-excel="${selectedRace.id}" ${raceRows.length?'':'disabled'}>Excel course</button></div></div>${raceRows.length?`<table><thead><tr><th>Rang</th><th>Dossard</th><th>Élève</th><th>Classe</th><th>Temps</th><th>Vitesse</th><th></th></tr></thead><tbody>${raceRows.map(r=>`<tr><td><b>${r.rank}</b></td><td>#${r.bib}</td><td>${esc(r.name)}</td><td>${esc(r.className)}</td><td><b>${r.time}</b></td><td>${r.speed}</td><td><button class="row-edit" data-edit-result="${r.studentId}">Modifier</button></td></tr>`).join('')}</tbody></table>`:'<p class="empty">Aucune arrivée.</p>'}`:'<p class="empty">Sélectionne une course.</p>'}</div></div>`;
    } else if(mode==='individual'){
      content=`<div class="card table-card"><table><thead><tr><th>Niveau</th><th>Sexe</th><th>Rang</th><th>Dossard</th><th>Élève</th><th>Classe</th><th>Temps</th></tr></thead><tbody>${g.individual.map(r=>`<tr><td>${esc(r.level)}</td><td>${esc(r.sex)}</td><td><b>${r.rank}</b></td><td>#${r.bib}</td><td>${esc(r.name)}</td><td>${esc(r.className)}</td><td><b>${r.time}</b></td></tr>`).join('')}</tbody></table></div>`;
    } else if(mode==='classes'){
      const classes=classNames();
      const selectedClass=classes.includes(state.resultClassName)?state.resultClassName:(classes[0]||'');
      const rows=g.byClass.filter(r=>r.className===selectedClass);
      const classDetail=`<div class="results-split class-results-detail"><div class="results-list">${classes.map(cls=>`<button class="result-course ${cls===selectedClass?'selected':''}" data-view-result-class="${esc(cls)}"><strong>${esc(cls)}</strong><span>${g.byClass.filter(r=>r.className===cls).length}/${state.students.filter(s=>s.className===cls).length} classés</span></button>`).join('')||'<p class="empty">Aucune classe.</p>'}</div><div class="card table-card results-main"><div class="card-head"><div><h3>${selectedClass?`Élèves de ${esc(selectedClass)}`:'Classement par classe'}</h3><p>${rows.length} classés · filles et garçons</p></div><div class="result-actions"><button class="button" data-export-class="${esc(selectedClass)}" ${rows.length?'':'disabled'}>PDF classe</button><button class="button" data-export-class-excel="${esc(selectedClass)}" ${rows.length?'':'disabled'}>Excel classe</button></div></div>${rows.length?`<table><thead><tr><th>Rang</th><th>Dossard</th><th>Élève</th><th>Sexe</th><th>Temps</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${r.rank}</b></td><td>#${r.bib}</td><td>${esc(r.name)}</td><td>${r.sex==='F'?'Fille':r.sex==='M'?'Garçon':'—'}</td><td><b>${r.time}</b></td><td><button class="row-edit" data-edit-result="${r.studentId}">Modifier</button></td></tr>`).join('')}</tbody></table>`:'<p class="empty">Aucun élève classé pour cette classe.</p>'}</div></div>`;
      content=classDetail;
    } else if(mode==='college'){
      const rowsTable=(rows,overall=false)=>`<table><thead><tr><th>Rang</th><th>Classe</th>${overall?'<th>Niveau</th>':''}<th>Classés</th><th>Temps moyen</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${r.rank}</b></td><td>${esc(r.className)}</td>${overall?`<td>${esc(r.level)}</td>`:''}<td>${r.count}/${r.enrolled}</td><td><b>${r.average}</b></td></tr>`).join('')||`<tr><td colspan="${overall?5:4}">Aucune classe avec un résultat.</td></tr>`}</tbody></table>`;
      const levels=['6e','5e','4e','3e'];
      const extraLevels=[...new Set(state.students.map(s=>s.level).filter(level=>level&&!levels.includes(level)))].sort();
      content=`<div class="card table-card college-overall"><h3>Classement des classes du collège</h3><p class="comparison-help">Classes classées selon le temps moyen de leurs élèves arrivés.</p>${rowsTable(g.classOverall,true)}</div><div class="college-level-grid">${[...levels,...extraLevels].map(level=>`<div class="card table-card college-level-card ${levelTone(level)}"><h3>Classes de ${esc(level)}</h3>${rowsTable(g.classAverages.filter(r=>r.level===level))}</div>`).join('')}</div>`;
    } else {
      const byRank=state.teacherRankingMode==='rank';
      content=`<div class="card table-card"><div class="result-tabs"><button data-teacher-ranking="time" class="${byRank?'':'active'}" aria-pressed="${!byRank}">Temps moyen</button><button data-teacher-ranking="rank" class="${byRank?'active':''}" aria-pressed="${byRank}">Classement moyen</button></div><p class="comparison-help">${byRank?'Moyenne des places de tous les élèves du professeur dans leur course respective (ex. : 1er + 4e + 10e = 5 de moyenne). Le plus petit rang moyen gagne.':'Moyenne des temps des élèves arrivés. Le plus petit temps moyen gagne.'}</p><table><thead><tr><th>Rang</th><th>Professeur EPS</th><th>Classes</th><th>Temps moyen</th><th>Classement moyen</th><th>Élèves pris en compte</th></tr></thead><tbody>${g.teacherAverages.map(r=>`<tr><td><b>${r.rank}</b></td><td>${esc(r.teacher)}</td><td>${esc(r.classes.join(', '))}</td><td>${byRank?r.average:`<b>${r.average}</b>`}</td><td>${byRank?`<b>${r.averageRank.toLocaleString('fr-FR',{maximumFractionDigits:2})}</b>`:r.averageRank.toLocaleString('fr-FR',{maximumFractionDigits:2})}</td><td>${r.count}</td></tr>`).join('')||'<tr><td colspan="6">Aucun résultat pour les professeurs EPS renseignés.</td></tr>'}</tbody></table></div>`;
    }

    return `<section class="results-page">
      <div class="hero-card results-hero"><div><span class="eyebrow">RÉSULTATS</span><h2>${done} élèves classés</h2><p>${ended.length} course${ended.length>1?'s':''} terminée${ended.length>1?'s':''}</p></div><div class="actions"><button class="button" id="export-excel" ${done?'':'disabled'}>Excel</button><button class="button primary" id="export-all-results" ${done?'':'disabled'}>Exporter PDF</button></div></div>
      <div class="result-tabs"><button data-result-mode="courses" class="${mode==='courses'?'active':''}">Courses</button><button data-result-mode="individual" class="${mode==='individual'?'active':''}">Individuels</button><button data-result-mode="classes" class="${mode==='classes'?'active':''}">Classes</button><button data-result-mode="college" class="${mode==='college'?'active':''}">Collège</button><button data-result-mode="teachers" class="${mode==='teachers'?'active':''}">Professeurs</button></div>
      ${content}
    </section>`;
  }

  function resultsPdfPickerModal() {
    return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="eyebrow">EXPORT DES RÉSULTATS</span><h2>Choisir le PDF</h2></div><button class="close" id="close-results-pdf">×</button></div><div class="pdf-export-choices"><button class="button" data-results-pdf="courses"><strong>Classement par course</strong><span>Un tableau par course : place, élève, classe, temps et vitesse moyenne.</span></button><button class="button" data-results-pdf="classes"><strong>Toutes les classes · 1 classe par page</strong><span>Un seul PDF complet : élève, temps, vitesse moyenne et place dans sa course.</span></button></div></div></div>`;
  }

  function classModal() {
    const cls=openClass, x=classStats(cls), teachers=state.classTeachers?.[cls]||[];
    return `<div class="modal-backdrop sheet-backdrop"><div class="modal class-modal"><div class="modal-head"><div><span class="eyebrow">${esc(x.level)}</span><h2>${esc(cls)}</h2><p>${x.total} élèves · ${x.girls} filles · ${x.boys} garçons</p></div><button class="close" id="close-class">×</button></div>
      <div class="teacher-box teacher-picker">
        <div><span class="teacher-label">Professeurs d’EPS · 2 maximum</span><strong class="teacher-current">${teachers.length?esc(teachers.join(' · ')):'À renseigner'}</strong></div>
        <div class="teacher-options">${EPS_TEACHERS.map(name=>`<button class="teacher-choice ${teachers.includes(name)?'selected':''}" aria-pressed="${teachers.includes(name)}" data-class-teacher-name="${esc(name)}">${esc(name)}</button>`).join('')}</div>
        <p class="edit-help">Sélectionne un ou deux professeurs. Reclique sur un nom pour le retirer. Les résultats comptent pour chacun.</p>
        ${teachers.length?`<button class="teacher-clear" id="clear-class-teacher">Retirer les attributions</button>`:''}
      </div>
      <div class="class-actions"><button class="button" data-export-bibs-class="${esc(cls)}">PDF des dossards</button><button class="button primary" id="add-student">+ Ajouter un élève</button></div>
      <div class="class-students">${x.students.sort((a,b)=>nameOf(a).localeCompare(nameOf(b),'fr')).map(s=>`<button data-edit-student="${s.id}"><span class="student-bib">#${esc(s.bib||'—')}</span><strong>${esc(nameOf(s))}</strong><span>${s.sex==='F'?'Fille':s.sex==='M'?'Garçon':'Sexe ?'}</span><small>Modifier</small></button>`).join('')}</div>
    </div></div>`;
  }

  function bibClassPickerModal() {
    const classes=classNames();
    return `<div class="modal-backdrop"><div class="modal bib-class-modal">
      <div class="modal-head"><div><span class="eyebrow">DOSSARDS PDF</span><h2>Choisir une classe</h2><p>Un PDF par classe · 2 dossards A5 par page A4 · qualité maximale.</p></div><button class="close" id="close-bib-class-picker">×</button></div>
      <div class="bib-class-grid">${classes.map(cls=>{
        const x=classStats(cls);
        return `<button class="bib-class-choice ${levelTone(x.level)}" data-export-bibs-class="${esc(cls)}"><span>${esc(x.level)}</span><strong>${esc(cls)}</strong><small>${x.total} élèves</small></button>`;
      }).join('')}</div>
    </div></div>`;
  }

  function studentModal() {
    const isNew=studentEditorId==='new';
    const s=isNew?{lastName:'',firstName:'',className:openClass||'',sex:'M',bib:''}:state.students.find(x=>x.id===studentEditorId);
    if(!s) return '';
    return `<div class="modal-backdrop editor-backdrop"><div class="modal student-modal"><div class="modal-head"><div><span class="eyebrow">${isNew?'NOUVEL ÉLÈVE':'MODIFIER'}</span><h2>${isNew?'Ajouter un élève':esc(nameOf(s))}</h2></div><button class="close" id="close-student">×</button></div>
      <div class="form-grid"><label>Nom<input id="student-last" value="${esc(s.lastName)}"></label><label>Prénom<input id="student-first" value="${esc(s.firstName)}"></label><label>Classe<input id="student-class" value="${esc(s.className)}"></label><label>Sexe<select id="student-sex"><option value="F" ${s.sex==='F'?'selected':''}>Fille</option><option value="M" ${s.sex==='M'?'selected':''}>Garçon</option><option value="X" ${s.sex==='X'?'selected':''}>Non renseigné</option></select></label><label>Dossard<input id="student-bib" type="number" inputmode="numeric" value="${esc(s.bib||'')}"></label></div>
      <button class="button primary full" id="save-student">${isNew?'Ajouter':'Enregistrer'}</button>
      ${!isNew?`<button class="button full" id="export-student-bib" data-student-id="${esc(s.id)}">Enregistrer et exporter ce dossard (A5)</button>`:''}
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

  function resultStudentCandidates(student) {
    const race=raceOf(student?.raceId);
    if(!race) return [];
    return state.students.filter(candidate=>candidate.id===student.id || candidate.raceId===race.id || (!candidate.raceId && race.levels?.includes(candidate.level) && race.sexes?.includes(candidate.sex)))
      .sort((a,b)=>nameOf(a).localeCompare(nameOf(b),'fr'));
  }

  function resultEditModal() {
    const s=state.students.find(x=>x.id===resultEditStudentId);
    if(!s || s.elapsedMs==null) return '';
    const r=raceOf(s.raceId);
    const totalSec=Math.max(0,Math.round(s.elapsedMs/1000));
    const min=Math.floor(totalSec/60), sec=totalSec%60;
    return `<div class="modal-backdrop"><div class="modal result-edit-modal">
      <div class="modal-head"><div><span class="eyebrow">CORRIGER UN RÉSULTAT</span><h2>#${esc(s.bib)} · ${esc(nameOf(s))}</h2><p>${esc(r?.name||'')} · temps actuel ${fmt(s.elapsedMs)}</p></div><button class="close" id="close-result-edit">×</button></div>
      <label class="result-student-label">Attribuer ce résultat à
        <select id="result-student">${resultStudentCandidates(s).map(candidate=>`<option value="${esc(candidate.id)}" ${candidate.id===s.id?'selected':''} ${candidate.id!==s.id&&candidate.elapsedMs!=null?'disabled':''}>#${esc(candidate.bib)} · ${esc(nameOf(candidate))} · ${esc(candidate.className)}${candidate.id!==s.id&&candidate.elapsedMs!=null?' · déjà classé':''}</option>`).join('')}</select>
      </label>
      <p class="edit-help">Choisis un élève de cette course. Son temps sera conservé ; l’élève précédent retrouvera le statut « non arrivé ».</p>
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
    $('#bibs')?.addEventListener('click',()=>{bibClassPickerOpen=true;render();});
    $('#close-bib-class-picker')?.addEventListener('click',()=>{bibClassPickerOpen=false;render();});
    document.querySelectorAll('[data-export-bibs-class]').forEach(b=>b.onclick=()=>exportBibs(b.dataset.exportBibsClass,b));
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
    $('#export-student-bib')?.addEventListener('click',e=>{
      const id=e.currentTarget.dataset.studentId;
      saveStudentEditor();
      if(studentEditorId!==null) return;
      const student=state.students.find(s=>s.id===id);
      if(student) exportBibs(student.className,null,id);
    });

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
    document.querySelectorAll('[data-teacher-ranking]').forEach(b=>b.onclick=()=>{state.teacherRankingMode=b.dataset.teacherRanking;save();render();});
    $('#export-all-results')?.addEventListener('click',()=>{resultsPdfPickerOpen=true;render();});
    $('#close-results-pdf')?.addEventListener('click',()=>{resultsPdfPickerOpen=false;render();});
    document.querySelectorAll('[data-results-pdf]').forEach(b=>b.onclick=()=>{const mode=b.dataset.resultsPdf;resultsPdfPickerOpen=false;render();exportResultsPdf(mode);});
    $('#export-excel')?.addEventListener('click',exportExcel);
    document.querySelectorAll('[data-view-result-class]').forEach(b=>b.onclick=()=>{state.resultClassName=b.dataset.viewResultClass;save();render();});
    document.querySelectorAll('[data-export-class]').forEach(b=>b.onclick=()=>exportClassPdf(b.dataset.exportClass));
    document.querySelectorAll('[data-export-class-excel]').forEach(b=>b.onclick=()=>exportScopedExcel('class',b.dataset.exportClassExcel));
    document.querySelectorAll('[data-export-race-excel]').forEach(b=>b.onclick=()=>exportScopedExcel('race',b.dataset.exportRaceExcel));
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
      Object.keys(classTeachers).forEach(k=>classTeachers[k]=classTeachers[k].slice(0,2));

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
    const source=state.students.find(x=>x.id===resultEditStudentId);
    const race=source ? raceOf(source.raceId) : null;
    if(!source||!race?.startedAt) return;
    const targetId=$('#result-student')?.value||source.id;
    const target=resultStudentCandidates(source).find(s=>s.id===targetId);
    if(!target) return notify('Choisis un élève de cette course.','error');
    if(target.id!==source.id && target.elapsedMs!=null) return notify('Cet élève possède déjà un résultat. Choisis un élève non arrivé.','error');
    const min=Number($('#result-minutes')?.value);
    const sec=Number($('#result-seconds')?.value);
    if(!Number.isInteger(min)||min<0||!Number.isInteger(sec)||sec<0||sec>59) return notify('Temps invalide. Utilise des minutes et des secondes entre 0 et 59.','error');
    const inputMs=(min*60+sec)*1000;
    // Un simple changement d'élève conserve aussi les millisecondes du chronomètre.
    const elapsedMs=inputMs===Math.floor(source.elapsedMs/1000)*1000 ? source.elapsedMs : inputMs;
    if(elapsedMs<=0 || !Number.isFinite(elapsedMs)) return notify('Le temps doit être supérieur à 0 seconde.','error');
    const stamp=race.startedAt+elapsedMs;
    const arrival=state.arrivals.slice().reverse().find(a=>a.studentId===source.id&&a.raceId===race.id);
    const reassigned=target.id!==source.id;
    if(reassigned){
      delete source.elapsedMs;
      delete source.finishedAt;
      state.arrivals=state.arrivals.filter(a=>a===arrival || !(a.studentId===source.id&&a.raceId===race.id));
    }
    target.raceId=race.id;
    target.elapsedMs=elapsedMs;
    target.finishedAt=stamp;
    if(arrival){
      arrival.studentId=target.id;
      arrival.elapsedMs=elapsedMs;
      arrival.stamp=stamp;
      arrival.method='corrected';
    } else {
      state.arrivals.push({id:uid(),studentId:target.id,raceId:race.id,stamp,elapsedMs,method:'corrected'});
    }
    state.notice=`${reassigned?'Résultat réattribué':'Résultat corrigé'} · #${target.bib} ${nameOf(target)} · ${fmt(elapsedMs)}`;
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
    const current=[...new Set(state.classTeachers[className]||[])];
    let selected=[];
    if(teacher){
      if(current.includes(teacher)) selected=current.filter(name=>name!==teacher);
      else {
        if(current.length>=2) return notify('Deux professeurs maximum : retire un nom avant d’en choisir un autre.','warning');
        selected=[...current,teacher];
      }
    }
    state.classTeachers[className]=selected;
    state.notice=selected.length?`${className} · EPS : ${selected.join(' et ')}`:`Professeurs EPS retirés pour ${className}`;
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
    const courseResults=new Map(byRace.map(row=>[row.studentId,row]));
    const classes=new Map(); finished.forEach(s=>{if(!classes.has(s.className)) classes.set(s.className,[]); classes.get(s.className).push(s);});
    [...classes.entries()].sort().forEach(([className,a])=>{a.sort((x,y)=>x.elapsedMs-y.elapsedMs);a.forEach((s,i)=>byClass.push({className,studentId:s.id,rank:i+1,bib:s.bib,name:nameOf(s),sex:s.sex,time:fmt(s.elapsedMs),speed:fmtSpeed(s),raceName:courseResults.get(s.id)?.raceName||'—',raceRank:courseResults.get(s.id)?.rank??'—'}));});
    const lc=new Map(); finished.forEach(s=>{const k=`${s.level}|${s.className}`; if(!lc.has(k)) lc.set(k,[]); lc.get(k).push(s);});
    const levels=new Map(); [...lc.entries()].forEach(([k,a])=>{const[level,className]=k.split('|'); if(!levels.has(level)) levels.set(level,[]); const enrolled=state.students.filter(s=>s.level===level&&s.className===className).length; levels.get(level).push({className,count:a.length,enrolled,averageMs:avg(a.map(s=>s.elapsedMs))});});
    [...levels.entries()].sort().forEach(([level,a])=>{a.sort((x,y)=>x.averageMs-y.averageMs);a.forEach((x,i)=>classAverages.push({level,rank:i+1,className:x.className,count:x.count,enrolled:x.enrolled,average:fmt(x.averageMs)}));});
    [...classes.entries()].map(([className,a])=>({className,level:a[0]?.level||'',count:a.length,enrolled:state.students.filter(s=>s.className===className).length,averageMs:avg(a.map(s=>s.elapsedMs))})).filter(x=>x.count>0).sort((a,b)=>a.averageMs-b.averageMs).forEach((x,i)=>classOverall.push({rank:i+1,className:x.className,level:x.level,count:x.count,enrolled:x.enrolled,average:fmt(x.averageMs)}));
    const teachers=new Map(); Object.entries(state.classTeachers||{}).forEach(([className,names])=>{ (names||[]).filter(Boolean).forEach(teacher=>{ if(!teachers.has(teacher)) teachers.set(teacher,{classes:new Set(),students:[]}); const obj=teachers.get(teacher); obj.classes.add(className); obj.students.push(...finished.filter(s=>s.className===className)); }); });
    const studentRanks=new Map();
    for(const row of byRace) studentRanks.set(row.studentId,row.rank);
    [...teachers.entries()].map(([teacher,obj])=>{
      const unique=[...new Map(obj.students.map(s=>[s.id,s])).values()].filter(student=>studentRanks.has(student.id));
      const enrolled=state.students.filter(s=>obj.classes.has(s.className)).length;
      return {teacher,classes:[...obj.classes].sort(),count:unique.length,enrolled,averageMs:avg(unique.map(s=>s.elapsedMs)),averageRank:avg(unique.map(s=>studentRanks.get(s.id)))};
    }).filter(x=>x.count>0).sort((a,b)=>{
      const criterion=state.teacherRankingMode==='rank'?'averageRank':'averageMs';
      return a[criterion]-b[criterion] || a.teacher.localeCompare(b.teacher,'fr');
    }).forEach((x,i)=>teacherAverages.push({...x,rank:i+1,average:fmt(x.averageMs)}));
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
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(g.teacherAverages.map(r=>({Rang:r.rank,Professeur:r.teacher,Classes:r.classes.join(', '),'Élèves classés':r.count,'Élèves inscrits':r.enrolled,'Temps moyen':r.average,'Classement moyen dans leur course':r.averageRank,'Critère du classement':state.teacherRankingMode==='rank'?'Classement moyen':'Temps moyen'}))),'Professeurs');
    XLSX.writeFile(wb,'resultats-cross.xlsx');
  }

  function pdfTable(doc,title,head,body,first){ if(!first) doc.addPage(); doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text(title,14,18); doc.autoTable({head:[head],body,startY:24,styles:{fontSize:8},headStyles:{fillColor:[15,23,42]}}); }
  function exportResultsPdf(mode) {
    if(!['courses','classes'].includes(mode)) return;
    const g=rankings();
    const rows=mode==='courses'?g.byRace:g.byClass;
    if(!rows.length) return notify('Aucun résultat à exporter.','warning');
    if(!window.jspdf?.jsPDF) return notify('Module PDF indisponible');
    const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
    if(typeof doc.autoTable !== 'function') return notify('Module tableau PDF indisponible');
    if(mode==='courses'){
      const races=state.races.filter(race=>g.byRace.some(row=>row.raceId===race.id));
      races.forEach((race,index)=>pdfTable(doc,race.name,['Place','Dossard','Élève','Classe','Temps','Vitesse moy.'],g.byRace.filter(row=>row.raceId===race.id).map(row=>[row.rank,row.bib,row.name,row.className,row.time,row.speed]),index===0));
    } else {
      classNames().forEach((className,index)=>drawClassResultsPage(doc,className,g.byClass.filter(row=>row.className===className),index===0));
    }
    doc.save(mode==='courses'?'resultats-par-course-cross.pdf':'resultats-toutes-classes-une-classe-par-page.pdf');
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

  const resultFileName = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').toLowerCase() || 'classement';

  function drawClassResultsPage(doc,className,rows,first=true) {
    if(!first) doc.addPage('a4','portrait');
    doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text(`Classe ${className}`,14,18);
    doc.setFont('helvetica','normal');doc.setFontSize(10);
    doc.text(`Cross 2026 - ${rows.length} élèves classés${state.crossDistanceM?' - '+state.crossDistanceM+' m':''}`,14,25);
    doc.setFontSize(9);doc.text('La place indiquée est celle de l’élève dans sa course.',14,32);
    doc.autoTable({
      head:[['Dossard','Élève','Temps','Vitesse moyenne','Course','Place dans la course']],
      body:rows.map(row=>[row.bib,row.name,row.time,row.speed,row.raceName,row.raceRank]),
      startY:38,margin:{top:38,bottom:14,left:14,right:14},
      styles:{fontSize:9,cellPadding:2,overflow:'linebreak'},
      headStyles:{fillColor:[15,23,42]},
      columnStyles:{0:{cellWidth:17},1:{cellWidth:62},2:{cellWidth:18},3:{cellWidth:26},4:{cellWidth:34},5:{cellWidth:25}},
      rowPageBreak:'avoid'
    });
    if(!rows.length){doc.setFontSize(11);doc.text('Aucun élève classé pour cette classe.',14,62);}
  }

  function exportClassPdf(className) {
    const rows=rankings().byClass.filter(r=>r.className===className);
    if(!rows.length) return notify('Aucun résultat dans cette classe.','warning');
    if(!window.jspdf?.jsPDF) return notify('Module PDF indisponible');
    const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
    if(typeof doc.autoTable!=='function') return notify('Module tableau PDF indisponible');
    drawClassResultsPage(doc,className,rows);
    doc.save(`resultats-classe-${resultFileName(className)}.pdf`);
  }

  function exportScopedExcel(kind,id) {
    if(!window.XLSX) return notify('Module Excel indisponible');
    const g=rankings(), isRace=kind==='race';
    const rows=isRace?g.byRace.filter(r=>r.raceId===id):g.byClass.filter(r=>r.className===id);
    if(!rows.length) return notify('Aucun résultat à exporter.','warning');
    const label=isRace?raceOf(id)?.name:id;
    const data=rows.map(r=>isRace?{Course:label,Rang:r.rank,Dossard:r.bib,Élève:r.name,Classe:r.className,Temps:r.time,'Vitesse moyenne':r.speed}:{Classe:label,Rang:r.rank,Dossard:r.bib,Élève:r.name,Sexe:r.sex,Temps:r.time});
    const wb=XLSX.utils.book_new(), sheet=XLSX.utils.json_to_sheet(data);
    sheet['!cols']=Object.keys(data[0]).map(key=>({wch:Math.max(key.length,...data.map(row=>String(row[key]??'').length))+2}));
    XLSX.utils.book_append_sheet(wb,sheet,'Classement');
    XLSX.writeFile(wb,`resultats-${isRace?'course':'classe'}-${resultFileName(label)}.xlsx`);
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

    drawMaisonCarree(ctx,sx,sy);
    // Supprime les chiffres du fond : l'année est écrite en texte PDF net et complet.
    ctx.fillStyle='#fff';
    ctx.fillRect(675*sx,214*sy,165*sx,40*sy);
    bibBackgroundDataCache=canvas.toDataURL('image/png');
    // Libère immédiatement ~35 Mo de bitmap sur iPad ; le PNG en mémoire suffit ensuite.
    canvas.width=1;
    canvas.height=1;
    return bibBackgroundDataCache;
  }

  function drawMaisonCarree(ctx,sx,sy) {
    ctx.save(); ctx.scale(sx,sy);
    const polygon=(points,color='#000')=>{
      ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...points[0]);
      points.slice(1).forEach(p=>ctx.lineTo(...p));ctx.closePath();ctx.fill();
    };
    // Efface uniquement l'ancien monument, au-dessus du terrain conservé.
    polygon([[92,270],[205,260],[221,365],[92,345]],'#fff');
    // Silhouette gravée et perspective oblique, dans le style des arènes.
    polygon([[96,303],[147,273],[172,281],[221,309],[217,314],[193,305],[101,309]]);
    polygon([[109,300],[147,281],[184,300]],'#fff');
    polygon([[114,298],[147,284],[178,298]]);
    polygon([[120,296],[147,286],[170,296]],'#fff');
    polygon([[100,305],[192,304],[220,313],[217,318],[190,311],[99,310]]);
    polygon([[107,313],[191,313],[218,321],[215,351],[187,348],[107,346]]);
    // Colonnes claires à contours irréguliers, chapiteaux et ombres latérales.
    for(let i=0;i<6;i++) {
      const x=103+i*16,offset=i%2;
      polygon([[x-2,310],[x+10,310],[x+9,314],[x+7,315],[x+7+offset,342],[x+10,347],[x-3,347],[x,342],[x+1,315],[x-2,314]],'#fff');
      polygon([[x+6,316],[x+8,316],[x+8,342],[x+5,342]]);
      polygon([[x+2,319],[x+3,317],[x+3,339],[x+1,341]]);
    }
    for(let i=0;i<4;i++) {
      const x=196+i*5,y=315+i*1.5;
      polygon([[x,y],[x+3,y+1],[x+2,347+i],[x-1,345+i]],'#fff');
    }
    // Podium brisé, stries et végétation raccordés au paysage existant.
    polygon([[96,349],[191,348],[220,358],[216,363],[190,355],[94,354]]);
    polygon([[92,357],[183,358],[218,366],[189,364],[98,362],[84,364]]);
    polygon([[83,366],[111,364],[190,368],[214,374],[170,370],[109,370],[91,373]]);
    polygon([[95,351],[122,350],[116,353],[98,354]],'#fff');
    polygon([[143,352],[178,352],[169,355],[137,354]],'#fff');
    polygon([[185,354],[211,361],[197,359]],'#fff');
    // Marques de pierre et hachures : aucun cadre rectangulaire autour du monument.
    for(let i=0;i<17;i++) {
      const x=101+(i*23)%112,y=305+(i*13)%52;
      polygon([[x,y],[x+4,y-1],[x+2,y+1]],i%3?'#fff':'#000');
    }
    polygon([[82,359],[87,348],[90,354],[98,347],[101,357],[112,352],[109,365],[96,368],[85,366]]);
    polygon([[187,363],[193,351],[197,359],[202,348],[206,357],[214,354],[219,368],[205,370]]);
    polygon([[92,363],[100,359],[96,364]],'#fff');
    polygon([[202,365],[212,362],[207,366]],'#fff');
    ctx.restore();
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

  async function preflightBibs(students) {
    const issues=bibIssues();
    if(issues.length) throw new Error(`Impossible de créer les dossards : ${issues.length} anomalie(s). ${issues[0]}`);
    if(!window.JsBarcode || !window.QRCode) throw new Error('Modules QR / Code 128 indisponibles.');
    if(!students?.length) throw new Error('Aucun élève dans cette classe.');

    const checks=[students[0],students[Math.floor(students.length/2)],students.at(-1)].filter(Boolean);
    for(const s of checks){
      const value=String(s.bib);
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      JsBarcode(svg,value,{format:'CODE128',displayValue:false,height:40,margin:8,width:2});
      if(svg.querySelectorAll('rect').length<2) throw new Error(`Code 128 invalide pour le dossard ${value}`);
      const holder=document.createElement('div');
      new QRCode(holder,{text:value,width:256,height:256,correctLevel:QRCode.CorrectLevel.H});
      const q=holder.querySelector('canvas')||holder.querySelector('img');
      if(!q) throw new Error(`QR invalide pour le dossard ${value}`);
      if(q.tagName==='CANVAS'){ q.width=1; q.height=1; }
    }
    await new Promise(resolve=>requestAnimationFrame(resolve));
    return true;
  }

  function scaledBibDocument(pdf,scale,top) {
    // Applique la même réduction à tous les éléments du dossard, textes et codes inclus.
    return {
      addImage:(data,format,x,y,w,h,...options)=>pdf.addImage(data,format,x*scale,top+y*scale,w*scale,h*scale,...options),
      rect:(x,y,w,h,style)=>pdf.rect(x*scale,top+y*scale,w*scale,h*scale,style),
      text:(value,x,y,options)=>pdf.text(value,x*scale,top+y*scale,options),
      setFont:(...args)=>pdf.setFont(...args),
      setFontSize:size=>pdf.setFontSize(size*scale),
      getTextWidth:value=>pdf.getTextWidth(value)/scale,
      setTextColor:(...args)=>pdf.setTextColor(...args),
      setFillColor:(...args)=>pdf.setFillColor(...args)
    };
  }

  async function exportBibs(className, triggerButton=null, studentId=null) {
    if(!window.jspdf?.jsPDF || !window.JsBarcode || !window.QRCode) return notify('Module dossards indisponible. Recharge avec Internet.','error');
    const students=state.students.filter(s=>studentId?s.id===studentId:s.className===className);
    if(!students.length) return notify('Aucun élève à exporter.','warning');

    const button=triggerButton instanceof HTMLElement ? triggerButton : null;
    const originalLabel=button?.textContent||'PDF';
    if(button){ button.disabled=true; button.textContent='Préparation…'; }

    try {
      await preflightBibs(students);

      let backgroundData;
      try { backgroundData=buildBibBackgroundData(); }
      catch(e){ throw new Error(e.message || 'Fond haute définition du dossard indisponible'); }

      // Qualité maximale identique à l'ancienne génération.
      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
      const W=297,H=210,centerX=W/2,total=students.length;
      const pageWidth=pdf.internal.pageSize.getWidth();
      const pageHeight=pdf.internal.pageSize.getHeight();
      const scale=Math.min(pageWidth/W,(pageHeight/2)/H);
      const slotMargin=(pageHeight/2-H*scale)/2;

      for(let i=0;i<total;i++){
        const s=students[i];
        if(i>0 && i%2===0) pdf.addPage('a4','portrait');
        const top=(i%2)*(pageHeight/2)+slotMargin;
        const doc=scaledBibDocument(pdf,scale,top);

        doc.addImage(backgroundData,'PNG',0,0,W,H,'bibBackgroundHD','FAST');
        doc.setFont('helvetica','bold');
        doc.setFontSize(19);
        doc.setTextColor(0,0,0);
        doc.text('2026',centerX,50.5,{align:'center'});
        drawVectorBarcode(doc,String(s.bib),98,65,101,17);

        const bib=String(s.bib);
        const bibSize=fitPdfText(doc,bib,112,150,82,'helvetica','bold');
        doc.setFont('helvetica','bold');
        doc.setFontSize(bibSize);
        doc.text(bib,centerX,132,{align:'center'});

        const classY=drawStudentName(doc,s,centerX);
        doc.setFont('helvetica','bold');
        doc.setFontSize(11.5);
        doc.text(String(s.className||''),centerX,classY,{align:'center'});

        // QR haute définition 1024 × 1024, comme avant.
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

        if(qrCanvas){ qrCanvas.width=1; qrCanvas.height=1; }
        if(i%4===3 || i===total-1){
          if(button) button.textContent=`${i+1}/${total}`;
          await new Promise(resolve=>requestAnimationFrame(resolve));
        }
      }

      if(button) button.textContent='Finalisation…';
      await new Promise(resolve=>setTimeout(resolve,0));

      const safeClass=String(className).replace(/[^a-zA-Z0-9_-]/g,'-');
      pdf.save(studentId?`dossard-${students[0].bib}-${safeClass}-cross-ada-lovelace-2026-a5.pdf`:`dossards-${safeClass}-cross-ada-lovelace-2026-a5.pdf`);

      state.notice=`${className} · ${total} dossards A5 · ${Math.ceil(total/2)} pages A4 · qualité maximale`;
      state.noticeKind='good';
      bibClassPickerOpen=false;
      save();
      render();
    } catch(e) {
      notify(e.message || 'Création du PDF impossible','error');
    } finally {
      const b=button;
      if(b && document.body.contains(b)){ b.disabled=false; b.textContent=originalLabel; }
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
        if(hadController && !sessionStorage.getItem('cross-browser-clean-v41')){
          sessionStorage.setItem('cross-browser-clean-v41','1');
          location.reload();
        }
        return;
      }
      const reg=await navigator.serviceWorker.register('/sw.js?v=41',{updateViaCache:'none'});
      await reg.update();
    }catch(_){}
  });
  applyRequestedStudentAddition();
  applyRequestedTimeCorrection();
  render();
  scheduleCloudSync(250);
})();
