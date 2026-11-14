(() => {
  'use strict';
  const STORAGE_KEY = 'the-tower-idle-preset-archive:v3'; // Keep browser settings from v1.1.1.
  const SCHEMA_VERSION = 12;
  const THEME_KEY = 'the-tower-idle-preset-theme:v1';
  const INITIAL = window.TOWER_INITIAL_SNAPSHOT;
  const DEFAULTS = window.TOWER_DEFAULT_PRESETS.map(base => {
    const extracted = INITIAL?.presets?.find(p => p.id === base.id);
    return extracted ? {...base, botStats: JSON.parse(JSON.stringify(extracted.botStats || {})), workshopLocks:{}, fields: {...Object.fromEntries(Object.keys(base.fields).map(key => [key, ''])), ...Object.fromEntries(Object.entries(extracted.fields).filter(([key]) => key !== 'notes'))}} : {...base, workshopLocks:{}};
  });
  for (const base of DEFAULTS) {
    if (typeof base.fields.perkOrder === 'string') base.fields.perkOrder = base.fields.perkOrder.split('\n').filter(Boolean).join('\n');
  }
  // The new tournament preset starts as a deep copy of Push_Trn_DS, but is never linked to it.
  // Existing browser data and imported backups with only five presets are handled in normalize().
  const tournamentDefault = DEFAULTS.find(p => p.id === 'tournament');
  const pushDefault = DEFAULTS.find(p => p.id === 'push');
  if (tournamentDefault && pushDefault) {
    tournamentDefault.fields = JSON.parse(JSON.stringify(pushDefault.fields));
    tournamentDefault.botStats = JSON.parse(JSON.stringify(pushDefault.botStats || {}));
    tournamentDefault.workshopLocks = JSON.parse(JSON.stringify(pushDefault.workshopLocks || {}));
  }
  const GROUPS = window.TOWER_GROUPS;

  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fieldLabels = Object.fromEntries(GROUPS.flatMap(group => group.fields));
  const allKeys = Object.keys(fieldLabels);
  const NEW_FIELDS = new Set(['strategy']);
  /* Metadata used by click-to-level editors; base stats from the game catalog. */
  const BOT_CONFIG = {
    '골봇':{stats:[['지속시간',30,20,.5,'초'],['쿨다운',15,120,-3,'초'],['보너스',30,2,.2,'배'],['범위',20,20,2,'m']],plus:{name:'보너스 셀+',max:25,base:1.25,per:.05,unit:'배'}},
    '봇봇':{stats:[['지속시간',30,20,.5,'초'],['쿨다운',15,120,-3,'초'],['보너스',19,1.05,.05,'배'],['범위',20,20,2,'m']],plus:{name:'최대 출력+',max:20,base:1.25,per:.05,unit:'배'}},
    '증폭봇':{stats:[['지속시간',30,20,.5,'초'],['쿨다운',15,120,-3,'초'],['보너스',30,3.5,.4,'배'],['범위',18,25,2,'m']],plus:{name:'에코샷+',max:9,base:3,per:1,unit:'배'}},
    '화염봇':{stats:[['대미지 감소',25,20,3,'%'],['쿨다운',15,75,-3,'초'],['대미지',30,50,8,'배'],['범위',15,30,4,'m']],plus:{name:'화상 증폭+',max:20,base:1.5,per:.1,unit:'배'}},
    '천둥봇':{stats:[['지속시간',20,5,.5,'초'],['쿨다운',15,120,-3,'초'],['잔류',20,20,3,'%'],['범위',15,25,3,'m']],plus:{name:'타이탄 충격+',max:20,base:5,per:1,unit:'%'}}
  };
  let editable = false;
  let comparing = false;
  let active = 'farm';
  let activeView = 'preset';
  let historyEditing = false;
  let toastTimer = null;
  let canPersist = true;
  let editStep = 1;
  // Edits save immediately as before, but an in-memory snapshot allows Cancel
  // to restore the complete state, including shared component banks and mastery.
  let editSnapshot = null;

  function compactGuardian(value) {
    if (!/^\s*슬롯\s*\d+\s*:/.test(value || '')) return value;
    return value.split(/\s*·\s*|\s*\|\s*/).map(part => part.replace(/^\s*슬롯\s*\d+\s*:\s*/, '').trim()).filter(Boolean).join(' | ');
  }

  function normalize(parsed) {
    if (!parsed || !Array.isArray(parsed.presets)) return clone(DEFAULTS);
    const migrated = !(Number(parsed.schemaVersion) >= 8);
    const normalized = DEFAULTS.map(defaultPreset => {
      const found = parsed.presets.find(p => p && p.id === defaultPreset.id);
      if (!found || !found.fields || typeof found.fields !== 'object') return clone(defaultPreset);
      const next = clone(defaultPreset);
      for (const key of allKeys) {
        if (typeof found.fields[key] === 'string') next.fields[key] = found.fields[key].slice(0, 10000);
      }
      if (migrated) {
        const legacyAuto = window.TOWER_LEGACY_V111?.[defaultPreset.id] || {};
        for (const key of Object.keys(legacyAuto)) {
          // A prior DAT-generated value can be upgraded; custom edits are never overwritten.
          if (typeof found.fields[key] === 'string' && found.fields[key] === legacyAuto[key]) {
            next.fields[key] = defaultPreset.fields[key] || '';
          }
        }
      }
      if (found.componentSources && typeof found.componentSources === 'object' && !Array.isArray(found.componentSources)) {
        next.componentSources = clone(found.componentSources);
      }
      if (found.customSourceValues && typeof found.customSourceValues === 'object' && !Array.isArray(found.customSourceValues)) {
        next.customSourceValues = clone(found.customSourceValues);
      }
      next.perkRankCount = Number.isInteger(found.perkRankCount) ? Math.min(13,Math.max(0,found.perkRankCount)) : Math.min(13,String(found.fields?.perkOrder||'').split('\n').filter(Boolean).length);
      next.fields.guardian = compactGuardian(next.fields.guardian || '');
      next.fields.perkOrder = String(next.fields.perkOrder || '').split('\n').filter(Boolean).join('\n');
      next.workshopLocks = {};
      if (found.workshopLocks && typeof found.workshopLocks === 'object' && !Array.isArray(found.workshopLocks)) {
        for (const [name, locked] of Object.entries(found.workshopLocks)) {
          if (typeof name === 'string' && name.length < 90 && !name.startsWith('extras:') && locked === true) next.workshopLocks[name] = true;
        }
      }
      if (found.botStats && typeof found.botStats === 'object' && !Array.isArray(found.botStats)) {
        for (const [botName, saved] of Object.entries(found.botStats)) {
          if (!BOT_CONFIG[botName] || !Array.isArray(saved?.levels)) continue;
          next.botStats ||= {};
          const cfg = BOT_CONFIG[botName];
          next.botStats[botName] = {
            levels: cfg.stats.map((stat, idx) => Math.min(stat[1], Math.max(0, Math.trunc(Number(saved.levels[idx]) || 0)))),
            plusLevel: Math.min(cfg.plus?.max || 0, Math.max(0, Math.trunc(Number(saved.plusLevel) || 0))),
            plusEnabled: typeof saved.plusEnabled === 'boolean' ? saved.plusEnabled : Number(saved.plusLevel) > 0,
            plusLocked: saved.plusLocked === true
          };
        }
      }
      return next;
    });
    // Upgrade a five-preset v1.1.7 browser state or JSON without changing its existing presets.
    // Copy the *saved* Push_Trn_DS settings, including locks and bot progress, exactly once.
    const hasTournament = parsed.presets.some(p => p?.id === 'tournament' && p.fields && typeof p.fields === 'object');
    if (!hasTournament) {
      const source = normalized.find(p => p.id === 'push');
      const targetIndex = normalized.findIndex(p => p.id === 'tournament');
      const metadata = DEFAULTS.find(p => p.id === 'tournament');
      if (source && targetIndex >= 0 && metadata) {
        normalized[targetIndex] = {
          ...clone(metadata),
          fields: clone(source.fields),
          botStats: clone(source.botStats || {}),
          workshopLocks: clone(source.workshopLocks || {})
        };
      }
    }
    return normalized;
  }
  function load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? normalize(JSON.parse(stored)) : clone(DEFAULTS);
    } catch (_) {
      canPersist = false;
      return clone(DEFAULTS);
    }
  }

  let presets = load();
  let sourceName = INITIAL?.source || '초기 기록';
  let waveRows = clone(INITIAL?.waves || []);
  let masteredCards = clone(INITIAL?.masteredCards || []);
  try {
    const restored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(restored?.waves) && restored.waves.length === 24) waveRows = restored.waves;
    if (Array.isArray(restored?.masteredCards)) masteredCards = restored.masteredCards.filter(x=>typeof x==='string').slice(0,64);
    if (typeof restored?.source === 'string' && restored.source.length < 128) sourceName = restored.source;
  } catch (_) {}

  // DAT imports game preset banks for workshop/bots/cards/guardian plus battle waves.
  // Modules, lab, priorities, perks and operating strategy remain manual.
  // Each site loadout points to a shared source slot, or its private custom slot.
  const COMPONENT_FIELDS = Object.freeze({
    workshop:['attack','defense','utility','extras'],
    bots:['bot1'],
    modules:['slot1','slot2','slot3','slot4'],
    guardian:['guardian'],
    cards:['cards']
  });
  const COMPONENT_GROUPS = Object.keys(COMPONENT_FIELDS);
  const GAME_IDS = ['farm','push','disatk','disuw','disutil'];
  const GAME_SOURCE_COUNT = {workshop:5,bots:5,cards:5,modules:2,guardian:2};
  const GAME_SOURCE_NAMES = GAME_IDS.map(id=>INITIAL?.presets?.find(p=>p.id===id)?.name || id);
  let guardianSourceNames=GAME_SOURCE_NAMES.slice(0,2);
  try {
    const savedNames=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(Array.isArray(savedNames?.gameSourceNames)&&savedNames.gameSourceNames.length===5)GAME_SOURCE_NAMES.splice(0,5,...savedNames.gameSourceNames);
    if(Array.isArray(savedNames?.guardianSourceNames)&&savedNames.guardianSourceNames.length>=2)guardianSourceNames=savedNames.guardianSourceNames.slice(0,2);
  } catch (_) {}
  let sourceBanks = {};

  function captureSection(p,group){
    const data={fields:{}};
    for(const key of COMPONENT_FIELDS[group])data.fields[key]=String(p.fields?.[key]||'');
    if(group==='workshop')data.workshopLocks=Object.fromEntries(Object.entries(p.workshopLocks||{}).filter(([name,value])=>!name.startsWith('extras:')&&value===true));
    if(group==='bots')data.botStats=clone(p.botStats||{});
    return data;
  }
  function applySection(p,group,data){
    if(!data || typeof data!=='object')return;
    for(const key of COMPONENT_FIELDS[group])p.fields[key]=typeof data.fields?.[key]==='string'?data.fields[key].slice(0,10000):'';
    if(group==='workshop')p.workshopLocks=Object.fromEntries(Object.entries(data.workshopLocks||{}).filter(([name,value])=>!name.startsWith('extras:')&&value===true));
    if(group==='bots')p.botStats=clone(data.botStats||{});
  }
  function makeSourceBanks(saved){
    const banks={};
    for(const group of COMPONENT_GROUPS){
      banks[group]=Array.from({length:GAME_SOURCE_COUNT[group]},(_,index)=>{
        const id=GAME_IDS[index];
        const fromSave=presets.find(p=>p.id===id)||DEFAULTS.find(p=>p.id===id);
        const fallback=captureSection(fromSave,group);
        const entry=saved?.[group]?.[index];
        if(!entry||typeof entry!=='object'||!entry.fields||typeof entry.fields!=='object')return fallback;
        const safe={fields:{}};
        for(const key of COMPONENT_FIELDS[group])safe.fields[key]=typeof entry.fields[key]==='string'?entry.fields[key].slice(0,10000):fallback.fields[key];
        if(group==='workshop')safe.workshopLocks=entry.workshopLocks&&typeof entry.workshopLocks==='object'?Object.fromEntries(Object.entries(entry.workshopLocks).filter(([name,value])=>!name.startsWith('extras:')&&value===true)):fallback.workshopLocks;
        if(group==='bots')safe.botStats=entry.botStats&&typeof entry.botStats==='object'?clone(entry.botStats):fallback.botStats;
        return safe;
      });
    }
    return banks;
  }
  function sectionIsSame(p,group,data){
    if(!data)return false;
    return COMPONENT_FIELDS[group].every(key=>String(p.fields?.[key]||'')===String(data.fields?.[key]||''))
      && (group!=='workshop'||JSON.stringify(p.workshopLocks||{})===JSON.stringify(data.workshopLocks||{}))
      && (group!=='bots'||JSON.stringify(p.botStats||{})===JSON.stringify(data.botStats||{}));
  }
  function initializeComponentSources(saved){
    sourceBanks=makeSourceBanks(saved?.sourceBanks);
    for(const p of presets){
      const oldSelections=p.componentSources&&typeof p.componentSources==='object'?p.componentSources:{};
      const oldCustom=p.customSourceValues&&typeof p.customSourceValues==='object'?p.customSourceValues:{};
      const index=GAME_IDS.indexOf(p.id);
      p.componentSources={};p.customSourceValues={};
      for(const group of COMPONENT_GROUPS){
        const count=GAME_SOURCE_COUNT[group];
        const defaultIndex=index>=0 && index<count?index:(p.id==='tournament'?1:'custom');
        let choice=Object.hasOwn(oldSelections,group)?oldSelections[group]:defaultIndex;
        if(choice!=='custom'&&(!Number.isInteger(Number(choice))||Number(choice)<0||Number(choice)>=count))choice='custom';
        if(choice!=='custom')choice=Number(choice);
        // The older tournament could already have unique manually edited values.
        if(!Object.hasOwn(oldSelections,group)&&p.id==='tournament'&&choice!== 'custom' && !sectionIsSame(p,group,sourceBanks[group][choice]))choice='custom';
        p.componentSources[group]=choice;
        const previous=oldCustom[group];
        if(previous&&typeof previous==='object'&&previous.fields){p.customSourceValues[group]=clone(previous);}
        if(choice==='custom'){
          if(!p.customSourceValues[group])p.customSourceValues[group]=captureSection(p,group);
          applySection(p,group,p.customSourceValues[group]);
        }else applySection(p,group,sourceBanks[group][choice]);
      }
    }
  }
  let startupState=null;
  try { startupState=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); } catch(_) {}
  initializeComponentSources(startupState);

  function captureAllCurrentSources(){
    // Only the active outer preset was edited. Its selected source is shared;
    // the other outer presets rehydrate without losing unrelated personal fields.
    const p=presets.find(row=>row.id===active);
    if(!p)return;
    for(const group of COMPONENT_GROUPS){
      const choice=p.componentSources?.[group];
      const snapshot=captureSection(p,group);
      if(choice==='custom')p.customSourceValues[group]=snapshot;
      else if(Number.isInteger(choice)&&sourceBanks[group]?.[choice])sourceBanks[group][choice]=snapshot;
    }
    for(const other of presets){
      if(other===p)continue;
      for(const group of COMPONENT_GROUPS){
        const choice=other.componentSources?.[group];
        if(Number.isInteger(choice) && sourceBanks[group]?.[choice])applySection(other,group,sourceBanks[group][choice]);
      }
    }
  }
  function changeComponentSource(group,choice){
    const p=current();if(!COMPONENT_FIELDS[group])return;
    const parsed=choice==='custom'?'custom':Number(choice);
    if(parsed!=='custom'&&(!Number.isInteger(parsed)||parsed<0||parsed>=GAME_SOURCE_COUNT[group]))return;
    if(p.componentSources[group]===parsed)return;
    // Persist the source being left before switching, including level locks.
    captureAllCurrentSources();
    if(parsed==='custom'&&!p.customSourceValues[group])p.customSourceValues[group]=captureSection(p,group);
    p.componentSources[group]=parsed;
    applySection(p,group,parsed==='custom'?p.customSourceValues[group]:sourceBanks[group][parsed]);
    persist();renderDetails();
    toast(`${{workshop:'작업장',bots:'봇',modules:'모듈',guardian:'가디언',cards:'카드'}[group]} 프리셋을 변경했습니다.`);
  }
  function sourcePicker(group){
    if(!COMPONENT_FIELDS[group])return '';
    const selected=current().componentSources?.[group];
    const count=GAME_SOURCE_COUNT[group];
    const options=Array.from({length:count},(_,i)=>{
      const name=(group==='guardian'?guardianSourceNames[i]:GAME_SOURCE_NAMES[i])||`게임 ${i+1}`;
      // The module and guardian catalogs have only two save slots.
      return `<option value="${i}" ${selected===i?'selected':''}>${String(i+1).padStart(2,'0')} · ${escapeHtml(name)}</option>`;
    });
    options.unshift(`<option value="custom" ${selected==='custom'?'selected':''}>직접 설정 (이 프리셋 전용)</option>`);
    return `<label class="group-source-picker"><span>연결 프리셋 <small>${count}종</small></span><select aria-label="${{workshop:'작업장',bots:'봇',modules:'모듈',guardian:'가디언',cards:'카드'}[group]} 연결 프리셋 선택" data-source-group="${group}">${options.join('')}</select></label>`;
  }

  function current() { return presets.find(p => p.id === active) || presets[0]; }
  function persist() {
    captureAllCurrentSources();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, presets, sourceBanks, gameSourceNames:GAME_SOURCE_NAMES, guardianSourceNames, waves: waveRows, source: sourceName, masteredCards }));
      canPersist = true;
      $('saveStatus').innerHTML = '<span class="status-dot"></span> 저장됨';
    } catch (_) {
      canPersist = false;
      $('saveStatus').innerHTML = '<span class="status-dot"></span> 저장 불가 · JSON 백업 권장';
      toast('브라우저 저장 공간을 사용할 수 없습니다. JSON 백업을 이용하세요.');
    }
  }
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function setTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    $('themeButton').setAttribute('aria-label', next === 'dark' ? '밝은 테마로 전환' : '어두운 테마로 전환');
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
  }
  try { setTheme(localStorage.getItem(THEME_KEY) || 'dark'); } catch (_) { setTheme('dark'); }


function renderNavigation() {
  const historyActive = activeView === 'history';
  $('sideNav').innerHTML = `
    <button type="button" class="side-link side-history ${historyActive?'active':''}" data-view="history" aria-current="${historyActive?'page':'false'}">
      <span class="side-num">00</span><span class="side-text"><span class="side-name">전투기록</span><span class="side-sub">불협 웨이브</span></span><span class="side-arrow">›</span>
    </button><div class="side-divider" aria-hidden="true"></div>` + presets.map((p,i)=>`
    <button type="button" class="side-link ${!historyActive && p.id===active?'active':''}" data-preset="${p.id}" aria-current="${!historyActive && p.id===active?'page':'false'}">
      <span class="side-num">${String(i+1).padStart(2,'0')}</span><span class="side-text"><span class="side-name">${escapeHtml(p.label)}</span><span class="side-sub">${escapeHtml(p.name)}</span></span><span class="side-arrow">›</span></button>`).join('');
}
function showActiveView() {
  $('history').classList.toggle('hidden',activeView!=='history');
  $('details').classList.toggle('hidden',activeView==='history');
  $('sectionNavDock').classList.toggle('hidden',activeView!=='preset'||comparing);
}
  function splitStats(value) {
    return String(value || '').split(/\n+/).flatMap(line => line.split('·')).map(v => v.trim()).filter(Boolean);
  }


const WORKSHOP_MAX = {
  attack:{'대미지':6000,'공속':99,'치확':79,'치명타 확률':150,'공격 범위':79,'대미지/미터':200,'멀티샷 확률':99,'멀티샷 표적':7,'고속 발사 확률':85,'고속 발사 지속 시간':99,'바운스 샷 확률':85,'바운스 샷 표적':7,'바운스 샷 범위':60,'슈퍼 치명타 확률':100,'슈퍼 치명타 승수':120,'방어구 가르기 확률':299,'방어구 가르기 승수':299},
  defense:{'체력':6000,'체력 재생':6000,'방어 %':99,'절대 방어':5000,'가시 대미지':99,'생명력 흡수':80,'넉백 확률':80,'넉백 강도':40,'오브 속도':38,'오브 수':4,'충격파 크기':35,'충격파 빈도':40,'지뢰 확률':50,'지뢰 대미지':200,'지뢰 반경':50,'죽음 저항':75,'장벽 체력':1800,'장벽 재건':300},
  utility:{'캐시 보너스':149,'캐시/웨이브':149,'코인/처치 보너스':149,'코인/웨이브':149,'무료 공격 업그레이드':99,'무료 방어 업그레이드':99,'무료 유틸리티 업그레이드':99,'이익/웨이브':99,'최대량':300,'최대 회복':500,'패키지 확률':60,'적 공격 레벨 건너뛰기':699,'적 체력 레벨 건너뛰기':699}
};
const WORKSHOP_ENHANCEMENT = [
  {category:'공격',items:[['대미지+',600],['방어구 가르기+',600],['치명타 계수+',600],['대미지/미터+',600],['슈퍼 치명타 승수+',600],['공격 속도+',600]]},
  {category:'방어',items:[['체력+',600],['체력 재생+',600],['절대 방어+',600],['지뢰 대미지+',600],['장벽 체력+',600],['오브 크기',250]]},
  {category:'유틸리티',items:[['캐시 보너스+',600],['코인 보너스+',300],['셀/처치 보너스+',300],['무료 업그레이드+',150],['회복 패키지+',600],['적 레벨 건너뛰기+',60]]}
];
const PERK_MAP=window.TOWER_NAME_MAPS?.perks || {};
const perkNames=Object.values(PERK_MAP);
const LEGACY_PERK_MAP=window.TOWER_NAME_MAPS?.legacyPerks || {};
const perkAliases=new Map(Object.entries(LEGACY_PERK_MAP).map(([id,name])=>[name,PERK_MAP[id]||name]));
function canonicalPerkName(name){return perkAliases.get(String(name).trim()) || String(name).trim();}
const perkType=name=>{const k=Object.keys(PERK_MAP).find(id=>PERK_MAP[id]===name);return k==null?'unknown':Number(k)>=40?'tradeoff':Number(k)>=20?'ultimate':'standard';};
const perkChip=(name)=>`<span class="perk-chip perk-${perkType(name)}">${escapeHtml(name)}</span>`;
function parseWorkshop(value) {
  const found=new Map();
  for(const token of splitStats(value)) {
    const match=token.match(/^(.*?)\s+Lv\.(\d+)(?:\s*\/\s*\d+)?$/);
    if(match) found.set(match[1].trim(),Number(match[2]));
  }
  return found;
}
function enhancementMaxMap(){return Object.fromEntries(WORKSHOP_ENHANCEMENT.flatMap(x=>x.items));}
function levelUpdateString(field,overrides){
  const mapped=parseWorkshop(current().fields[field]);
  for(const [key,n] of Object.entries(overrides))mapped.set(key,n);
  if(field!=='extras') {
    const catalog=WORKSHOP_MAX[field]||{};
    const out=Object.keys(catalog).filter(name=>(mapped.get(name)||0)>0).map(name=>`${name} Lv.${mapped.get(name)}`);
    // Keep any user-created entries not covered by the known level catalog.
    for(const [name,level] of mapped)if(!(name in catalog)&&level>0)out.push(`${name} Lv.${level}`);
    return out.join(' · ');
  }
  const rows=WORKSHOP_ENHANCEMENT.map(group=>group.items.filter(([name])=>(mapped.get(name)||0)>0).map(([name])=>`${name} Lv.${mapped.get(name)}`).join(' · ')).filter(Boolean);
  for(const [name,level] of mapped)if(!WORKSHOP_ENHANCEMENT.some(g=>g.items.some(x=>x[0]===name))&&level>0)rows.push(`${name} Lv.${level}`);
  return rows.join('\n');
}
function levelStep(before,max,dir) {
  if(editStep==='max')return dir>0?max:0;
  return Math.min(max,Math.max(0,before+dir*Number(editStep)));
}
function changeWorkshopStat(key,name,dir){
  const caps=key==='extras'?enhancementMaxMap():WORKSHOP_MAX[key];
  if(!caps || !(name in caps) || (key!=='extras' && current().workshopLocks?.[`${key}:${name}`]))return;
  const before=parseWorkshop(current().fields[key]).get(name)||0;
  const next=levelStep(before,caps[name],dir);
  if(next===before)return;
  current().fields[key]=levelUpdateString(key,{[name]:next});
  persist();renderDetails();
}
function toggleLevelLock(field,name) {
  // 작업장 강화는 잠금 기능을 사용하지 않습니다.
  if(field==='extras')return;
  const locks=current().workshopLocks ||= {};
  const key=`${field}:${name}`;
  if (locks[key]) delete locks[key]; else locks[key]=true;
  persist(); renderDetails();
}
function renderLevelCard(name,level,maximum,field,editable){
  const maxed=level===maximum && maximum>0;
  const locked=field!=='extras' && !!current().workshopLocks?.[`${field}:${name}`];
  return `<div class="level-tile ${maxed?'is-max':''} ${locked?'is-locked':''}" data-level-card="${escapeHtml(field)}">
    <div class="level-tile-name">${locked?'<span class="tile-lock-icon" aria-hidden="true">🔒</span>':''}${escapeHtml(name)}${maxed?'<span class="max-pill">MAX</span>':''}</div>
    <div class="level-tile-numbers"><strong>${Number(level).toLocaleString('ko-KR')}</strong><span>/ ${Number(maximum).toLocaleString('ko-KR')}</span></div>
    ${editable?`<div class="tile-buttons"><button type="button" data-level-field="${field}" data-stat-name="${escapeHtml(name)}" data-direction="-1" ${locked?'disabled':''} aria-label="${escapeHtml(name)} 레벨 감소">−</button><button type="button" data-level-field="${field}" data-stat-name="${escapeHtml(name)}" data-direction="1" ${locked?'disabled':''} aria-label="${escapeHtml(name)} 레벨 증가">+</button></div>
    ${field!=='extras'?`<button class="tile-lock-button" type="button" data-level-lock="${field}" data-stat-name="${escapeHtml(name)}" aria-pressed="${locked}" aria-label="${escapeHtml(name)} ${locked?'잠금 해제':'잠금'}">${locked?'🔒 잠금 해제':'🔓 잠금'}</button>`:''}`:''}
  </div>`;
}
function renderWorkshopCards(key,value,editable){
  const values=parseWorkshop(value);
  const isEnhance=key==='extras';
  const groups=isEnhance?WORKSHOP_ENHANCEMENT:[{category:'',items:Object.entries(WORKSHOP_MAX[key]||{})}];
  return `<div class="workshop-level-sections">${groups.map(({category,items})=>`<div class="workshop-level-section">${category?`<h5>${escapeHtml(category)} 강화</h5>`:''}<div class="level-tiles">${items.map(([name,max])=>renderLevelCard(name,values.get(name)||0,max,key,editable)).join('')}</div></div>`).join('')}</div>`;
}
const BOT_ALIASES={'골든 봇':'골봇','봇 봇':'봇봇','증폭 봇':'증폭봇','화염 봇':'화염봇','천둥 봇':'천둥봇'};
const BOT_NAMES=Object.keys(BOT_CONFIG);
function enabledBots(){return [...new Set(splitStats(current().fields.bot1||'').map(name=>BOT_ALIASES[name]||name))].filter(n=>BOT_CONFIG[n]);}
function ensureBotStats(name){
  current().botStats ||= {};
  if(!current().botStats[name])current().botStats[name]={levels:[0,0,0,0],plusLevel:0};
  return current().botStats[name];
}
function toggleBot(name){
  if(!BOT_CONFIG[name])return;
  const bots=new Set(enabledBots());if(bots.has(name))bots.delete(name);else bots.add(name);
  current().fields.bot1=BOT_NAMES.filter(x=>bots.has(x)).join(' · ');
  persist();renderDetails();
}
function changeBotStat(name,index,dir){
  const config=BOT_CONFIG[name];if(!config)return;
  const stats=ensureBotStats(name);
  if(index===4 && (stats.plusLocked || !stats.plusEnabled))return;
  const max=index===4?(config.plus?.max||0):config.stats[index]?.[1];
  if(max==null)return;
  const before=index===4?Number(stats.plusLevel||0):Number(stats.levels[index]||0);
  const after=levelStep(before,max,dir);if(before===after)return;
  if(index===4)stats.plusLevel=after;else stats.levels[index]=after;
  persist();renderDetails();
}
function toggleBotPlus(name,kind){
  if(!BOT_CONFIG[name]?.plus)return;
  const saved=ensureBotStats(name);
  if(kind==='lock') saved.plusLocked=!saved.plusLocked;
  if(kind==='enabled' && !saved.plusLocked) saved.plusEnabled=!saved.plusEnabled;
  persist();renderDetails();
}
function renderBotStat(name,index,entry,level,editable){
  const [label,max,base,increase,unit]=entry;
  const actual=Math.round((base+increase*level)*100)/100;
  const n=Number.isInteger(actual)?String(actual):actual.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  return `<div class="bot-stat ${level===max?'is-max':''}">
    <div class="bot-stat-name">${escapeHtml(label)}${level===max?'<span class="bot-max">MAX</span>':''}</div>
    <div class="bot-stat-level">${level} <span>/ ${max}</span></div>
    <div class="bot-stat-value">${n}${escapeHtml(unit)}</div>
    ${editable?`<div class="tile-buttons"><button type="button" data-bot-stat="${escapeHtml(name)}" data-bot-index="${index}" data-direction="-1" aria-label="${escapeHtml(name)} ${escapeHtml(label)} 감소">−</button><button type="button" data-bot-stat="${escapeHtml(name)}" data-bot-index="${index}" data-direction="1" aria-label="${escapeHtml(name)} ${escapeHtml(label)} 증가">+</button></div>`:''}
  </div>`;
}
function renderBots(editable){
  const on=enabledBots();
  return `<div class="bot-editor">${editable?`<div class="bot-enable-controls"><span>활성 봇 선택</span>${BOT_NAMES.map(name=>`<button type="button" class="bot-toggle ${on.includes(name)?'active':''}" data-bot-toggle="${escapeHtml(name)}" aria-pressed="${on.includes(name)}">${escapeHtml(name)}</button>`).join('')}</div>`:''}
    ${on.length?`<div class="bot-panels">${on.map(name=>{
      const cfg=BOT_CONFIG[name],saved=ensureBotStats(name),levels=saved.levels||[0,0,0,0];
      const plus=saved.plusLocked===true, enabled=saved.plusEnabled===true;
      return `<div class="bot-panel"><div class="bot-panel-title"><strong>${escapeHtml(name)}</strong><span>레벨별 스탯</span></div><div class="bot-stats">${cfg.stats.map((entry,i)=>renderBotStat(name,i,entry,levels[i]||0,editable)).join('')}</div>
        ${cfg.plus?`<div class="bot-plus bot-plus-area ${plus?'is-locked':''} ${enabled?'is-enabled':''}"><div class="bot-plus-row"><span>${plus?'🔒 ':''}${escapeHtml(cfg.plus.name)}</span><strong>${saved.plusLevel||0} / ${cfg.plus.max}</strong></div><div class="bot-plus-row"><span class="plus-status">${enabled?'활성화':'비활성화'}</span>${editable?`<button type="button" data-bot-plus="${escapeHtml(name)}" data-bot-plus-action="enabled" ${plus?'disabled':''}>${enabled?'● 활성':'○ 비활성'}</button><button type="button" data-bot-plus="${escapeHtml(name)}" data-bot-plus-action="lock">${plus?'🔒 잠금 해제':'🔓 잠금'}</button>`:''}</div>${editable?`<div class="tile-buttons"><button type="button" data-bot-stat="${escapeHtml(name)}" data-bot-index="4" data-direction="-1" ${plus||!enabled?'disabled':''}>−</button><button type="button" data-bot-stat="${escapeHtml(name)}" data-bot-index="4" data-direction="1" ${plus||!enabled?'disabled':''}>+</button></div>`:''}</div>`:''}</div>`;
    }).join('')}</div>`:`<p class="field-empty">활성 봇 없음</p>`}
  </div>`;
}
const targetIconClasses={'수호자':'protector','스포트라이드 범위 내':'spotlight','신속':'fast','원거리':'ranged','플릿':'fleet','엘리트':'elite','보스':'boss','프로텍터':'protector','가장 가까운 적':'closest','스포트라이트':'spotlight','탱크':'tank','일반':'basic'};
const targetAliases={'프로텍터':'수호자','스포트라이트':'스포트라이드 범위 내','스포트라이트 범위 내':'스포트라이드 범위 내'};
function targetsFrom(value){return String(value||'').split('→').map(x=>targetAliases[x.trim()]||x.trim()).filter(Boolean);}
function moveTarget(index,dir){
  const names=targetsFrom(current().fields.priority);const next=index+dir;
  if(next<0||next>=names.length)return;
  [names[index],names[next]]=[names[next],names[index]];
  current().fields.priority=names.join(' → ');persist();renderDetails();
}
function reorderTarget(from,to){
  const names=targetsFrom(current().fields.priority);
  if(from<0||from>=names.length||to<0||to>=names.length||from===to)return;
  const [moved]=names.splice(from,1);names.splice(to,0,moved);
  current().fields.priority=names.join(' → ');persist();renderDetails();
}
function renderTargets(value,editable){
  const names=targetsFrom(value);
  if(!names.length)return '<div class="field-value field-empty">대상 없음</div>';
  return `<div class="target-list">${names.map((name,i)=>`<div class="target-row ${i>=7?'target-disabled':''} ${editable?'can-drag':''}" ${editable?`draggable="true" data-drag-sort="target" data-drag-index="${i}" title="끌어서 우선순위 변경"`:''}>
    <span class="target-left">${editable?'<span class="drag-grip" aria-hidden="true">⠿</span>':''}<i class="target-icon ${targetIconClasses[name]||'basic'}"></i>${escapeHtml(name)}</span>
    <span class="target-row-actions"><span class="target-rank">${i<7?i+1:'–'}</span>${editable?`<button type="button" data-target-move="${i}" data-direction="-1" ${i===0?'disabled':''} aria-label="${escapeHtml(name)} 위로 이동">↑</button><button type="button" data-target-move="${i}" data-direction="1" ${i===names.length-1?'disabled':''} aria-label="${escapeHtml(name)} 아래로 이동">↓</button>`:''}</span>
  </div>`).join('')}</div>`;
}
function banNames(value){
  const all=[...String(value||'').matchAll(/^•\s*(.+)$/gm)].map(x=>canonicalPerkName(x[1]));
  if(all.length)return [...new Set(all)].filter(n=>perkNames.includes(n)).slice(0,8);
  const old=String(value||'').match(/금지 특전[^\n]*?#[^\n]+/)?.[0]||'';
  return [...new Set((old.match(/#\d+/g)||[]).map(id=>PERK_MAP[id.slice(1)]).filter(Boolean))].slice(0,8);
}
function parsedPerkLines(value){return [...new Set(String(value||'').split('\n').map(s=>canonicalPerkName(s.trim().replace(/^\d+[.．]\s*/, ''))).filter(n=>perkNames.includes(n)))];}
function fullPerkOrder(value){
  const saved=parsedPerkLines(value);
  return [...saved,...perkNames.filter(name=>!saved.includes(name))];
}
function rankCount(){
  const value=current().perkRankCount;
  if(Number.isInteger(value))return Math.min(13,Math.max(0,value));
  return Math.min(13,parsedPerkLines(current().fields.perkOrder).length);
}
function perkOrderNames(value){return fullPerkOrder(value).slice(0,rankCount());}
function writeBans(names){current().fields.perks=`금지 특전 (${names.length}개):\n`+names.map(name=>'• '+name).join('\n');}
function togglePerkBan(name){
  if(!perkNames.includes(name))return;
  const selected=banNames(current().fields.perks);
  const index=selected.indexOf(name);
  if(index>=0)selected.splice(index,1);
  else {if(selected.length>=8){toast('금지 특전은 최대 8개까지만 선택할 수 있습니다.');return;}selected.push(name);}
  writeBans(selected);persist();renderDetails();
}
function writePerkOrder(names,count=rankCount()){
  const ordered=[...new Set(names)].filter(name=>perkNames.includes(name));
  for(const name of perkNames)if(!ordered.includes(name))ordered.push(name);
  current().perkRankCount=Math.min(13,Math.max(0,count));
  current().fields.perkOrder=ordered.map((name,i)=>`${String(i+1).padStart(2,'0')}. ${name}`).join('\n');
}
function reorderPerk(from,to){
  const full=fullPerkOrder(current().fields.perkOrder);
  if(from<0||from>=full.length||to<0||to>=full.length||from===to)return;
  const [moved]=full.splice(from,1);full.splice(to,0,moved);
  writePerkOrder(full);persist();renderDetails();
}
function movePerk(index,dir){reorderPerk(index,index+dir);}
function removePerk(index){
  const full=fullPerkOrder(current().fields.perkOrder),count=rankCount();
  if(index<0||index>=count)return;
  const [removed]=full.splice(index,1);full.push(removed);
  writePerkOrder(full,count-1);persist();renderDetails();
}
function addPerk(name){
  const full=fullPerkOrder(current().fields.perkOrder),count=rankCount();
  if(!perkNames.includes(name))return;
  const index=full.indexOf(name);if(index<0)return;
  full.splice(index,1);full.splice(count>=13?12:count,0,name);
  writePerkOrder(full,Math.min(13,count+1));persist();renderDetails();
}
function renderPerkBans(value,editable){
  const selected=banNames(value),full=selected.length>=8;
  const badge=name=>editable?`<button type="button" class="perk-chip perk-${perkType(name)} perk-remove-chip" data-perk-ban="${escapeHtml(name)}" aria-label="${escapeHtml(name)} 금지 해제">${escapeHtml(name)} <b class="chip-remove">×</b></button>`:perkChip(name);
  return `<div class="setting-field perks-field"><span class="field-label">금지 특전 (${selected.length}/8)${editable&&full?' · 8개 선택 완료':''}</span><div class="perk-grid">${selected.map(badge).join('')}</div>${editable?`<details class="perk-edit-details" open><summary>금지 특전 선택 · 선택된 항목을 다시 누르면 해제</summary><div class="perk-toggle-grid">${perkNames.map(name=>{const chosen=selected.includes(name);return `<button type="button" class="perk-choice perk-${perkType(name)} ${chosen?'selected':''}" data-perk-ban="${escapeHtml(name)}" aria-pressed="${chosen}" ${full&&!chosen?'disabled title="8개 모두 지정됨 — 선택된 항목을 해제하세요"':''}><span class="perk-check">${chosen?'✓':'+'}</span>${escapeHtml(name)}</button>`}).join('')}</div></details>`:''}</div>`;
}
function renderPerkOrder(value,editable){
  const full=fullPerkOrder(value),count=rankCount();
  if(!editable)return `<div class="setting-field perks-field"><span class="field-label">자동 선택 순서 (${count}/13) · 미지정 ${full.length-count}개</span><div class="perk-grid">${full.slice(0,count).map((name,i)=>`<span class="perk-chip perk-${perkType(name)}"><b>#${i+1}</b> ${escapeHtml(name)}</span>`).join('')}</div><details class="perk-order-details"><summary>순위 미지정 특전 ${full.length-count}개 펼치기</summary><div class="perk-grid perk-grid-extra">${full.slice(count).map(name=>`<span class="perk-chip perk-unranked perk-${perkType(name)}">${escapeHtml(name)}</span>`).join('')}</div></details></div>`;
  return `<div class="setting-field perks-field"><span class="field-label">자동 선택 순서 (${count}/13) · 드래그로 순서 변경 · 13위 아래는 순위 없음</span>
    <div class="perk-order-editor" role="list" aria-label="특전 자동 선택 순서">${full.map((name,i)=>`<div class="perk-order-row ${i>=count?'perk-order-unranked':''} can-drag" draggable="true" data-drag-sort="perk" data-drag-index="${i}" role="listitem" title="드래그하여 순서 변경">
      <span class="drag-grip" aria-hidden="true">⠿</span><span class="perk-order-rank">${i<count?String(i+1).padStart(2,'0'):'—'}</span>${perkChip(name)}
      <span class="perk-order-actions"><button type="button" data-perk-move="${i}" data-direction="-1" ${i===0?'disabled':''} aria-label="${escapeHtml(name)} 위로">↑</button><button type="button" data-perk-move="${i}" data-direction="1" ${i===full.length-1?'disabled':''} aria-label="${escapeHtml(name)} 아래로">↓</button>${i<count?`<button type="button" data-perk-remove="${i}" aria-label="${escapeHtml(name)} 순위 제외">×</button>`:`<button type="button" data-perk-promote="${escapeHtml(name)}" aria-label="${escapeHtml(name)} 13위 안에 편입">＋</button>`}</span>
    </div>`).join('')}</div></div>`;
}

/* Equipment catalogs are grouped by reliably identified slot types. Existing custom names stay selectable. */
const MODULE_OPTIONS={
  slot1:['혼란 도래자','사형선고','절멸자','아스트랄','증폭일격','황저','전술 탄막'],
  slot2:['웜홀 재지향기','음질프','공변기','큐방포','안와','프젝자','회복 보너스','날용','감프'],
  slot3:['블소','펄서','갤압','하네스','임계값'],
  slot4:['멀티버스 넥서스','차코','하모니 도체','옴칩','원붕']
};
// Each module selector is restricted to the correct equipment category.
const GUARDIAN_OPTIONS=['현상금','공격','동맹','회수','소환','정찰'];
const CARD_OPTIONS=[...new Set([...DEFAULTS.flatMap(p=>String(p.fields.cards||'').split(',').map(x=>x.trim()).filter(Boolean)),
  '대미지','공속','체력','체젠','범위','캐시','코인','저속오라','치확','적밸','방어','무료업','추옵','대포','치코',
  '웨건뛰','인트로','지뢰기절','패확','죽광','네트','슈타','세컨','데몬','에쉴','웨엑','광전사','궁치','핵','광역공격','셀','절방'] )];
function moduleParts(value){return String(value||'').split(/\s*\+\s*/).filter(Boolean).slice(0,2);}
function equipModule(slot,pos,value){
  if(!['slot1','slot2','slot3','slot4'].includes(slot)|| ![0,1].includes(pos))return;
  const parts=moduleParts(current().fields[slot]);
  const options=new Set(MODULE_OPTIONS[slot]);
  if(value && !options.has(value))return;
  if(pos===1 && value && !parts[0]){toast('주 모듈을 먼저 선택해 주세요.');renderDetails();return;}
  parts[pos]=value;
  if(pos===0 && !value)parts[1]='';
  current().fields[slot]=parts.filter(Boolean).join(' + ');
  persist();renderDetails();
}
function moduleOptions(slot,chosen){
  const permitted=MODULE_OPTIONS[slot]||[];
  const option=(v)=>`<option value="${escapeHtml(v)}" ${v===chosen?'selected':''}>${escapeHtml(v)}</option>`;
  // A legacy invalid item is never silently replaced until the user makes a choice.
  return `<option value="" ${!chosen||!permitted.includes(chosen)?'selected':''}>장착 안 함</option>${permitted.map(option).join('')}`;
}
function renderModules(key,label,value,editable){
  const parts=moduleParts(value);
  return `<div class="setting-field equipment-field"><div class="equip-heading"><strong>${escapeHtml(label)} 모듈</strong></div>
  ${editable?`<div class="equip-edit-row"><label>주 모듈<select data-module-slot="${key}" data-module-pos="0">${moduleOptions(key,parts[0]||'')}</select></label><label>보조 모듈<select data-module-slot="${key}" data-module-pos="1">${moduleOptions(key,parts[1]||'')}</select></label></div>`:`<div class="equip-display">${parts.length?parts.map(name=>`<span class="equip-pill">${escapeHtml(name)}</span>`).join('<span class="equip-separator">+</span>'):'<span class="muted-caption">미장착</span>'}</div>`}</div>`;
}
function guardianNames(value){return compactGuardian(value).split(/\s*\|\s*/).map(x=>x.trim()).filter(Boolean).slice(0,2);}
function equipGuardian(slot,value){
 if(![0,1].includes(slot))return;
 const names=guardianNames(current().fields.guardian);
 if(value && !GUARDIAN_OPTIONS.includes(value) && !names.includes(value))return;
 if(slot===1 && value && !names[0]){toast('1번 슬롯부터 선택해 주세요.');renderDetails();return;}
 names[slot]=value;
 if(slot===0 && !value)names[1]='';
 current().fields.guardian=names.filter(Boolean).join(' | ');
 persist();renderDetails();
}
function renderGuardians(value,editable){
 const names=guardianNames(value);
 const item=(name,i)=>`<div class="guardian-slot"><small>${i+1}번 슬롯</small>${editable?`<select data-guardian-slot="${i}"><option value="">장착 안 함</option>${[...new Set([...GUARDIAN_OPTIONS,...names])].filter(Boolean).map(n=>`<option value="${escapeHtml(n)}" ${n===name?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select>`:`<span class="guardian-equipped">${name?escapeHtml(name):'미장착'}</span>`}</div>`;
 // Render only the two actual slot controls. No separator character or element is inserted
 // between the native selects (the old visual separator looked like a stray text caret).
 return `<div class="guardian-slots ${editable?'guardian-slots-edit':''}">${[0,1].map(i=>item(names[i]||'',i)).join('')}</div>`;
}
function cardNames(value){return String(value||'').split(',').map(x=>x.trim()).filter(Boolean);}
function toggleCard(name){
 if(!CARD_OPTIONS.includes(name))return;
 const cards=cardNames(current().fields.cards);const pos=cards.indexOf(name);
 if(pos>=0)cards.splice(pos,1);else {if(cards.length>=25){toast('장착 카드는 최대 25개까지 선택할 수 있습니다.');return;}cards.push(name);}
 current().fields.cards=cards.join(', ');persist();renderDetails();
}
function toggleMastery(name){
 if(!CARD_OPTIONS.includes(name))return;
 const mastered=new Set(masteredCards);if(mastered.has(name))mastered.delete(name);else mastered.add(name);
 masteredCards=[...mastered];persist();renderDetails();
}
function renderCards(value,editable){
 const cards=cardNames(value),mastery=new Set(masteredCards);
 const tile=name=>`<div class="card-choice-tile ${mastery.has(name)?'has-mastery':''}"><span class="card-text">${escapeHtml(name)}</span>${mastery.has(name)?'<strong class="card-mastery" title="마스터리 해금">M</strong>':''}${editable?`<div class="card-tile-actions"><button type="button" data-card-mastery="${escapeHtml(name)}" class="mastery-toggle" aria-pressed="${mastery.has(name)}" title="마스터리 설정">M</button><button type="button" data-card-toggle="${escapeHtml(name)}" aria-label="${escapeHtml(name)} 장착 해제">×</button></div>`:''}</div>`;
 const other=CARD_OPTIONS.filter(name=>!cards.includes(name));
 return `<div class="setting-field cards-panel"><span class="field-label">카드 구성 · ${cards.length} / 25개</span><div class="card-gear-grid">${cards.map(tile).join('')}</div>${editable?`<details class="equip-catalog" open><summary>카드 장착 목록 (${other.length}개) · 클릭하여 장착</summary><div class="card-available-grid">${other.map(name=>`<button type="button" data-card-toggle="${escapeHtml(name)}" class="card-available" ${cards.length>=25?'disabled':''}>+ ${escapeHtml(name)}</button>`).join('')}</div></details>`:''}</div>`;
}
/* 연구실은 잠금 없이 0~실제 최대 레벨 슬라이더로 편집합니다. */
const LAB_MAX = {labShockwave:20,labRange:80};
function readLabLevel(value, maximum) {
  const text=String(value ?? '').trim();
  if(!text)return null;
  const match=text.match(/Lv\.?\s*(\d+)/i) || text.match(/^(\d+)\s*(?:\/\s*\d+)?$/);
  if(!match)return null;
  return Math.max(0, Math.min(maximum,Number(match[1])));
}
function renderLaboratoryCard(key, label, value, editable) {
  const maximum=LAB_MAX[key];
  const saved=readLabLevel(value,maximum);
  const currentLevel=saved ?? 0;
  const maxed=saved !== null && saved===maximum;
  const progress=(currentLevel/maximum*100).toFixed(2)+'%';
  return `<div class="setting-field lab-field">
    <div class="lab-tile ${maxed?'is-max':''}">
      <div class="level-tile-name">${escapeHtml(label)}<strong class="max-pill lab-max-pill" ${!maxed?'hidden':''}>MAX</strong></div>
      <div class="level-tile-numbers"><strong data-lab-output="${key}">${saved===null?'—':currentLevel}</strong><span>/ ${maximum}</span></div>
      ${editable?`<div class="lab-slider-wrap">
        <input type="range" class="lab-slider" data-lab-slider="${key}" id="slider-${key}"
          min="0" max="${maximum}" step="1" value="${currentLevel}" style="--lab-progress:${progress}"
          aria-label="${escapeHtml(label)} 연구 레벨" aria-valuetext="${currentLevel} / ${maximum} 레벨">
        <div class="lab-slider-limits"><span>최소 0</span><span>최대 ${maximum}</span></div>
      </div>`:''}
    </div>
  </div>`;
}

function fieldView(group,key,label,value){
  const safeLabel=escapeHtml(label);
  if(group.id==='workshop' && ['attack','defense','utility','extras'].includes(key)){
    return `<div class="setting-field workshop-field"><span class="field-label">${safeLabel}</span>${renderWorkshopCards(key,value,editable)}</div>`;
  }
  if(group.id==='bots' && key==='bot1')return `<div class="setting-field bots-field">${renderBots(editable)}</div>`;
  if(group.id==='targeting')return `<div class="setting-field target-field"><div class="target-heading">적 우선순위 <span>Lv.2/2</span></div>${renderTargets(value,editable)}</div>`;
  if(group.id==='perks'&&key==='perks')return renderPerkBans(value,editable);
  if(group.id==='perks'&&key==='perkOrder')return renderPerkOrder(value,editable);
  if(group.id==='modules')return renderModules(key,label,value,editable);
  if(group.id==='guardian')return `<div class="setting-field"><span class="field-label">착용 가디언</span>${renderGuardians(value,editable)}</div>`;
  if(group.id==='cards')return renderCards(value,editable);
  if(group.id==='laboratory' && Object.hasOwn(LAB_MAX,key))return renderLaboratoryCard(key,label,value,editable);
  if(editable){
    const rows=group.id==='cards'?5:group.id==='notes'?3:2;
    return `<div class="setting-field"><label class="field-label" for="edit-${key}">${safeLabel}</label><textarea id="edit-${key}" class="field-editor" rows="${rows}" data-field="${key}" placeholder="설정을 입력하세요">${escapeHtml(value)}</textarea></div>`;
  }
  if(group.id==='cards' && value){
    const cards=value.split(',').map(x=>x.trim()).filter(Boolean),mastery=new Set(masteredCards);
    return `<div class="setting-field cards-panel"><span class="field-label">카드 구성 · ${cards.length}개</span><div class="field-cardchips">${cards.map(card=>`<span class="card-chip"><span class="card-text">${escapeHtml(card)}</span>${mastery.has(card)?'<strong class="card-mastery" title="마스터리 해금">M</strong>':''}</span>`).join('')}</div></div>`;
  }
  if(group.id==='guardian'){
    const names=compactGuardian(value).split(/\s*\|\s*/).map(x=>x.trim()).filter(Boolean);
    return `<div class="setting-field"><span class="field-label">${safeLabel}</span><div class="guardian-chips">${names.map(name=>`<span class="guardian-chip">${escapeHtml(name)}</span>`).join('<span class="guardian-separator">|</span>')}</div></div>`;
  }
  return `<div class="setting-field"><span class="field-label">${safeLabel}</span><div class="field-value ${value?'':'field-empty'}">${value?escapeHtml(value):''}</div></div>`;
}

  function renderDetails() {
    const p = current();
    const index = presets.findIndex(x => x.id === p.id);
    $('headIndex').textContent = String(index + 1).padStart(2, '0');
    $('headType').textContent = p.name;
    $('detailsTitle').textContent = p.label;
    $('headDesc').textContent = p.description;
    $('saveStatus').innerHTML = `<span class="status-dot"></span> ${canPersist ? '저장됨' : '저장 불가'}`;
    $('editButton').textContent = editable ? '✓ 편집 완료' : '✎ 세팅 편집';
    $('cancelEditButton').classList.toggle('hidden', !editable);
    $('editToolbar').classList.toggle('hidden', !editable);
    $('stepToolbar').classList.toggle('hidden', !editable);
    document.querySelectorAll('[data-step]').forEach(el=>el.classList.toggle('active',String(el.dataset.step)===String(editStep)));
    const strategy = p.fields.strategy || '';
    $('group-strategy').innerHTML=`<div class="group-heading"><div class="group-heading-title"><span class="group-number">01</span><span class="group-title-block"><h4>운영방향</h4></span></div><span class="strategy-note">프리셋별 수동 설정</span></div>${editable?`<textarea class="field-editor" rows="2" id="strategyInput" data-field="strategy" placeholder="예: 공격 범위 30m · 적 레벨 스킵 조정">${escapeHtml(strategy)}</textarea>`:`<div class="strategy-value ${strategy?'':'field-empty'}">${strategy?escapeHtml(strategy):'설정된 운영 방향 없음'}</div>`}`;
    $('settingNavigation').innerHTML=GROUPS.map(g=>`<button type="button" class="jump-button" data-jump="${g.id}">${escapeHtml(g.title)}</button>`).join('');
    $('settingGroups').innerHTML=GROUPS.map(group => {
      if(group.id==='strategy')return '';
      const fields=group.fields;
      if(!fields.length)return '';
      return `<section id="group-${group.id}" class="setting-group group-${group.id}" data-columns="${group.columns}" aria-label="${escapeHtml(group.title)}">
        <div class="group-heading"><div class="group-heading-title"><span class="group-number">${group.number}</span><span class="group-title-block"><h4>${escapeHtml(group.title)}</h4></span></div>${sourcePicker(group.id)}</div>
        <div class="field-grid ${group.id === 'workshop' ? 'field-grid-workshop' : ''}">${fields.map(([key,label])=>fieldView(group,key,label,p.fields[key] || '')).join('')}</div>
      </section>`;
    }).join('');
  }

  function beginEdit() {
    // Save the entire starting state because the same linked game source can
    // update multiple outer presets during a single editing session.
    captureAllCurrentSources();
    editSnapshot = {
      presets: clone(presets),
      sourceBanks: clone(sourceBanks),
      masteredCards: clone(masteredCards),
      waves: clone(waveRows),
      sourceName,
      startPreset: active
    };
    editable = true;
    renderDetails();
  }
  function finishEdit() {
    if (!editable) return;
    editable = false;
    editSnapshot = null;
    persist();
    renderDetails();
    toast('편집한 설정을 저장했습니다.');
  }
  function cancelEdit() {
    if (!editable || !editSnapshot) return;
    // Restore both private settings and shared source banks, undoing any
    // changes already auto-saved to localStorage during this session.
    presets = clone(editSnapshot.presets);
    sourceBanks = clone(editSnapshot.sourceBanks);
    masteredCards = clone(editSnapshot.masteredCards);
    waveRows = clone(editSnapshot.waves);
    sourceName = editSnapshot.sourceName;
    active = editSnapshot.startPreset;
    editable = false;
    editSnapshot = null;
    persist();
    renderNavigation();
    renderDetails();
    renderHistory();
    showActiveView();
    toast('편집 전 설정으로 복원했습니다.');
  }

  function setActive(id) {
    if (!presets.some(p => p.id === id)) return;
    active = id;
    activeView = 'preset';
    if (comparing) closeCompare();
    renderNavigation();
    renderDetails();
    renderHistory();
    showActiveView();
    $('details').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }


function openHistory() {
  if (editable) { editable = false; editSnapshot = null; renderDetails(); }
  if (comparing) closeCompare();
  activeView='history';
  renderNavigation();renderHistory();showActiveView();
  window.scrollTo({top:0,behavior:'smooth'});
}
  function saveField(key, value) {
    if (!allKeys.includes(key)) return;
    current().fields[key] = value.slice(0, 10000);
    persist();
  }

  function renderComparison() {
    const a = presets.find(p => p.id === $('compareA').value) || presets[0];
    const b = presets.find(p => p.id === $('compareB').value) || presets[1];
    $('comparisonContent').innerHTML = `<table class="comparison-table"><thead><tr><th>항목</th><th>${escapeHtml(a.label)}</th><th>${escapeHtml(b.label)}</th></tr></thead><tbody>${GROUPS.map(group => `<tr class="comparison-section"><td colspan="3">${escapeHtml(group.number + ' / ' + group.title)}</td></tr>${group.fields.map(([key, label]) => {
      const aa = a.fields[key] || '';
      const bb = b.fields[key] || '';
      return `<tr class="${aa !== bb ? 'diff' : ''}"><td>${escapeHtml(label)}</td><td>${escapeHtml(aa)}</td><td>${escapeHtml(bb)}</td></tr>`;
    }).join('')}`).join('')}</tbody></table>`;
  }
  function openCompare() {
    comparing = true; editable = false; editSnapshot = null;
    $('detailsPanel').classList.add('hidden');
    $('comparisonPanel').classList.remove('hidden');
    $('sectionNavDock').classList.add('hidden');
    $('compareA').innerHTML = presets.map(p => `<option value="${p.id}">${escapeHtml(p.label)}</option>`).join('');
    $('compareB').innerHTML = $('compareA').innerHTML;
    $('compareA').value = active;
    $('compareB').value = active === 'farm' ? 'push' : 'farm';
    renderComparison();
    $('details').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeCompare() {
    comparing = false;
    $('detailsPanel').classList.remove('hidden');
    $('comparisonPanel').classList.add('hidden');
    renderDetails();showActiveView();
  }

  function summaryText() {
    const p = current();
    return [`[The Tower Idle · ${p.label}]`, p.name, p.description, '', ...GROUPS.flatMap(group => [`■ ${group.title}`, ...group.fields.map(([key, label]) => `- ${label}: ${p.fields[key] || '미기록'}`), ''])].join('\n');
  }
  async function copySummary() {
    const text = summaryText();
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const box = document.createElement('textarea');
        box.value = text; box.style.position = 'fixed'; box.style.left = '-9999px';
        document.body.appendChild(box); box.select();
        if (!document.execCommand('copy')) throw new Error('copy');
        box.remove();
      }
      toast('현재 프리셋 설정을 복사했습니다.');
    } catch (_) { toast('복사할 수 없습니다. JSON 백업을 이용하세요.'); }
  }

  function exportJson() {
    captureAllCurrentSources();
    const content = { app: 'the-tower-idle-preset-archive', schemaVersion: SCHEMA_VERSION, source: sourceName, waves: waveRows, masteredCards, gameSourceNames:GAME_SOURCE_NAMES, guardianSourceNames, exportedAt: new Date().toISOString(), presets, sourceBanks };
    const blob = new Blob([JSON.stringify(content, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = `the-tower-presets-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('JSON 백업 파일을 내려받았습니다.');
  }

  async function importJson(file) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('파일이 너무 큽니다.');
      const parsed = JSON.parse(await file.text());
      if (parsed.app !== 'the-tower-idle-preset-archive' || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(parsed.schemaVersion) || !Array.isArray(parsed.presets)) throw new Error('지원하지 않는 백업 파일입니다.');
      // Accept five-preset backups from earlier versions; the new tournament is copied from Push_Trn_DS.
      if (!DEFAULTS.filter(p => p.id !== 'tournament').every(p => parsed.presets.some(x => x?.id === p.id && x.fields && typeof x.fields === 'object'))) throw new Error('기존 5개 프리셋을 포함한 백업이 아닙니다.');
      const hasTournament = parsed.presets.some(p => p?.id === 'tournament' && p.fields && typeof p.fields === 'object');
      if (!confirm(hasTournament ? '현재 브라우저에 저장된 6개 프리셋을 백업 파일 내용으로 바꾸시겠습니까?' : '기존 5개 프리셋을 복원하고, 새 토너 프리셋은 토너·등반·방어런 설정을 복사해 만들까요?')) return;
      presets = normalize(parsed); active = 'farm'; activeView = 'preset'; editable = false; editSnapshot = null; historyEditing = false;
      initializeComponentSources(parsed);
      if (Array.isArray(parsed.waves) && parsed.waves.length === 24) waveRows = parsed.waves;
      if (Array.isArray(parsed.masteredCards)) masteredCards=parsed.masteredCards.filter(x=>typeof x==='string');
      if(Array.isArray(parsed.gameSourceNames)&&parsed.gameSourceNames.length===5)GAME_SOURCE_NAMES.splice(0,5,...parsed.gameSourceNames);
      guardianSourceNames=Array.isArray(parsed.guardianSourceNames)&&parsed.guardianSourceNames.length>=2?parsed.guardianSourceNames.slice(0,2):GAME_SOURCE_NAMES.slice(0,2);
      sourceName = typeof parsed.source === 'string' ? parsed.source : sourceName;
      if (comparing) closeCompare();
      persist(); renderNavigation(); renderDetails(); renderHistory(); showActiveView(); toast('6개 프리셋을 가져왔습니다.');
    } catch (error) { toast(error instanceof SyntaxError ? 'JSON 파일을 읽을 수 없습니다.' : error.message); }
    finally { $('importFile').value = ''; }
  }

  // A single DAT import updates ONLY the allowed game-owned bank slots.
  // All other groups (especially modules, strategy, lab and perks) and every
  // site's private "direct setting" data remain intact.
  function applyAllowedImport(data){
    captureAllCurrentSources();
    const groups=['workshop','bots','cards','guardian'];
    for(const group of groups){
      const imported=data.banks?.[group];
      const expected=GAME_SOURCE_COUNT[group];
      if(!Array.isArray(imported)||imported.length<expected)
        throw new Error(`${group}의 저장 프리셋 수가 맞지 않습니다.`);
    }
    for(const group of groups){
      const count=GAME_SOURCE_COUNT[group];
      for(let index=0;index<count;index++){
        const existing=clone(sourceBanks[group][index]);
        const incoming=data.banks[group][index];
        for(const field of COMPONENT_FIELDS[group]){
          if(typeof incoming.fields?.[field]!=='string')throw new Error(`${group} 프리셋 데이터가 누락됐습니다.`);
          existing.fields[field]=incoming.fields[field];
        }
        if(group==='bots'){
          const updated=clone(existing.botStats||{});
          for(const [name,stat] of Object.entries(incoming.botStats||{})){
            const old=updated[name]||{};
            const plusUnlocked=stat.plusUnlocked===true;
            updated[name]={
              levels:clone(stat.levels),
              plusLevel:stat.plusLevel,
              plusEnabled:typeof old.plusEnabled==='boolean'?old.plusEnabled:(plusUnlocked&&stat.plusLevel>0),
              plusLocked:old.plusLocked===true
            };
          }
          existing.botStats=updated;
        }
        // workshopLocks are personal UI preferences; never import lock states.
        sourceBanks[group][index]=existing;
      }
    }
    for(const p of presets){
      for(const group of groups){
        const choice=p.componentSources?.[group];
        if(Number.isInteger(choice)&&choice>=0&&choice<GAME_SOURCE_COUNT[group]){
          applySection(p,group,sourceBanks[group][choice]);
        }
      }
    }
    if(Array.isArray(data.masteredCards))masteredCards=clone(data.masteredCards);
    GAME_SOURCE_NAMES.splice(0,GAME_SOURCE_COUNT.workshop,...data.gameNames);
    guardianSourceNames=data.guardianNames.slice(0,2);
    waveRows=clone(data.waves);
    sourceName=data.source;
    historyEditing=false;
    persist();
    renderNavigation();renderDetails();renderHistory();
  }
  async function importAllowedDat(file) {
    if (!file) return;
    const buttons=[$('datButton'),$('datTopButton')].filter(Boolean);
    if(editable||historyEditing){
      alert('편집 모드를 종료하거나 편집을 완료한 뒤 DAT 파일을 불러와 주세요.');
      $('datFile').value='';
      return;
    }
    const originalLabels=buttons.map(x=>x.textContent);
    buttons.forEach(b=>{b.disabled=true;b.textContent='DAT 분석 중…';});
    try {
      const data=await window.TowerDatReader.readAllowedGameData(file);
      if(data.gameNames.length!==5||data.waves.length!==24)
        throw new Error('인게임 프리셋 5개 또는 전투기록 24개 티어를 확인하지 못했습니다.');
      const message=`${file.name} 파일을 정상적으로 읽었습니다.\n\n`+
        `갱신: 불협 전투기록(T1~T24), 작업장 5종, 봇 5종, 카드 5종, 가디언 2종, 카드 마스터리\n`+
        `유지: 직접 설정 프리셋, 운영방향, 연구실, 모듈, 적 우선순위, 특전 및 잠금 설정\n\n`+
        `연결된 게임 프리셋 값만 교체합니다. 갱신 전 JSON 백업을 권장합니다. 진행할까요?`;
      if(!confirm(message))return;
      applyAllowedImport(data);
      toast('DAT 전투기록·작업장·봇·가디언·카드 프리셋을 갱신했습니다.');
    } catch (error) {
      console.error('DAT 가져오기 실패:',error);
      alert('DAT 파일을 불러오지 못했습니다.\n'+(error?.message||'알 수 없는 오류'));
    } finally {
      buttons.forEach((b,i)=>{b.disabled=false;b.textContent=originalLabels[i];});
      $('datFile').value='';
    }
  }

  function formatWave(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
      ? Number(value).toLocaleString('ko-KR') : '—';
  }
  function renderHistoryRows(rows) {
    const keys=['attack','health','coin','ultimate'];
    return rows.map(row=>`<tr>
      <th scope="row">T${Number(row.tier)}</th>
      ${keys.map(key => historyEditing
        ? `<td class="wave-${key}"><input class="history-wave-input" type="number" min="0" max="999999" step="1" inputmode="numeric" aria-label="T${Number(row.tier)} ${key} 웨이브" data-wave-tier="${Number(row.tier)}" data-wave-key="${key}" value="${row[key] == null ? '' : escapeHtml(row[key])}" placeholder="—"></td>`
        : `<td class="wave-${key}">${formatWave(row[key])}</td>`).join('')}
    </tr>`).join('');
  }
  function isWaveComplete(row) {
    return ['attack','health','coin','ultimate'].every(key=>row?.[key] !== null && row?.[key] !== undefined && Number(row[key]) >= 5000);
  }
  function renderHistory() {
    $('historySource').textContent=`기록 출처: ${sourceName}`;
    $('editHistoryButton').textContent=historyEditing?'✓ 기록 편집 완료':'✎ 기록 편집';
    $('editHistoryButton').setAttribute('aria-pressed',String(historyEditing));
    if(historyEditing){
      $('historyBody').innerHTML=renderHistoryRows(waveRows);
      $('historyCompleted').innerHTML='<p class="history-edit-hint">빈 칸은 기록 없음으로 저장합니다. 수정한 값은 자동 저장되며 JSON 백업에도 포함됩니다.</p>';
      return;
    }
    const incomplete=waveRows.filter(row=>!isWaveComplete(row));
    const completed=waveRows.filter(isWaveComplete);
    $('historyBody').innerHTML=incomplete.length?renderHistoryRows(incomplete):'<tr><td colspan="5" class="history-empty">모든 티어가 4개 런 기준 5,000웨이브를 달성했습니다.</td></tr>';
    $('historyCompleted').innerHTML=completed.length?`
      <details class="history-complete-block"><summary>4개 런 모두 5,000웨이브를 달성한 티어 ${completed.length}개 펼치기</summary>
      <div class="history-table-wrap history-table-wrap-sub"><table class="history-table" aria-label="완료된 티어 전투기록"><thead><tr><th>티어</th><th class="wave-attack">공격런</th><th class="wave-health">체력런</th><th class="wave-coin">코인런</th><th class="wave-ultimate">궁무런</th></tr></thead><tbody>${renderHistoryRows(completed)}</tbody></table></div></details>`:'';
  }

  // Basic dissonance boosts by wave, excluding cumulative Echo effects.
  const dissonanceMultiplier=(wave,maximum)=>1+(maximum-1)*Math.pow(Math.min(5000,Math.max(0,wave))/5000,1.75);
  const fmtMult=value=>`${value.toFixed(3)}×`;
  function renderGrowthChart(){
    const width=960,height=306,pad={left:62,right:20,top:16,bottom:43};
    const iw=width-pad.left-pad.right,ih=height-pad.top-pad.bottom;
    const x=wave=>pad.left+wave/5000*iw;
    const y=value=>pad.top+(5-value)/4*ih;
    const path=cap=>Array.from({length:101},(_,i)=>`${i===0?'M':'L'}${x(i*50).toFixed(2)},${y(dissonanceMultiplier(i*50,cap)).toFixed(2)}`).join(' ');
    const horizontal=[1,2,3,4,5].map(v=>`<line class="chart-gridline" x1="${pad.left}" y1="${y(v)}" x2="${width-pad.right}" y2="${y(v)}"/><text class="chart-axis-label" x="${pad.left-13}" y="${y(v)+4}" text-anchor="end">${v}×</text>`).join('');
    const vertical=[0,1000,2000,3000,4000,5000].map(v=>`<line class="chart-gridline" x1="${x(v)}" y1="${pad.top}" x2="${x(v)}" y2="${height-pad.bottom}"/><text class="chart-axis-label" x="${x(v)}" y="${height-14}" text-anchor="middle">${v.toLocaleString('ko-KR')}</text>`).join('');
    $('dissonanceChart').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="웨이브 0부터 5,000까지 공격, 체력, 궁무 배율은 1배에서 5배로, 코인 배율은 1배에서 3배로 증가하는 그래프" xmlns="http://www.w3.org/2000/svg">
      ${horizontal}${vertical}
      <path d="${path(5)}" class="chart-line chart-line-five"/><path d="${path(3)}" class="chart-line chart-line-three"/>
      <circle cx="${x(5000)}" cy="${y(5)}" r="5" class="chart-dot-five"/><circle cx="${x(5000)}" cy="${y(3)}" r="5" class="chart-dot-three"/>
    </svg>`;
  }
  function renderGrowthTable(){
    const interval=Number($('waveInterval').value)||500;
    const rows=[];
    for(let wave=0;wave<=5000;wave+=interval){
      const atk=dissonanceMultiplier(wave,5),coin=dissonanceMultiplier(wave,3);
      const prev=Math.max(0,wave-interval);
      const atkGain=wave?atk-dissonanceMultiplier(prev,5):0;
      const coinGain=wave?coin-dissonanceMultiplier(prev,3):0;
      rows.push(`<tr><th scope="row">${wave.toLocaleString('ko-KR')}</th><td class="wave-attack">${fmtMult(atk)}</td><td class="wave-increase">${wave?`+${atkGain.toFixed(3)}×`:'—'}</td><td class="wave-coin">${fmtMult(coin)}</td><td class="wave-increase">${wave?`+${coinGain.toFixed(3)}×`:'—'}</td></tr>`);
    }
    $('growthTableBody').innerHTML=rows.join('');
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-preset]');
    if (target) setActive(target.dataset.preset);
    const view=event.target.closest('[data-view]');if(view?.dataset.view==='history') openHistory();
  });
  $('stepToolbar').addEventListener('click', event => {
    const btn = event.target.closest('[data-step]');
    if (!btn) return;
    editStep = btn.dataset.step === 'max' ? 'max' : Number(btn.dataset.step);
    document.querySelectorAll('[data-step]').forEach(el=>el.classList.toggle('active',el===btn));
  });
  $('settingGroups').addEventListener('click', event => {
    if (!editable) return;
    const btn=event.target.closest('button[data-level-field],button[data-level-lock],button[data-bot-plus],button[data-bot-toggle],button[data-bot-stat],button[data-target-move],button[data-perk-ban],button[data-perk-move],button[data-perk-remove],button[data-perk-add],button[data-perk-promote],button[data-card-toggle],button[data-card-mastery]');
    if (!btn) return;
    if (btn.hasAttribute('data-level-lock')) {
      toggleLevelLock(btn.dataset.levelLock,btn.dataset.statName);
    } else if (btn.hasAttribute('data-bot-plus')) {
      toggleBotPlus(btn.dataset.botPlus,btn.dataset.botPlusAction);
    } else if (btn.hasAttribute('data-card-toggle')) {
      toggleCard(btn.dataset.cardToggle);
    } else if (btn.hasAttribute('data-card-mastery')) {
      toggleMastery(btn.dataset.cardMastery);
    } else if (btn.hasAttribute('data-level-field')) {
      changeWorkshopStat(btn.dataset.levelField,btn.dataset.statName,Number(btn.dataset.direction));
    } else if (btn.hasAttribute('data-bot-toggle')) {
      toggleBot(btn.dataset.botToggle);
    } else if (btn.hasAttribute('data-bot-stat')) {
      changeBotStat(btn.dataset.botStat,Number(btn.dataset.botIndex),Number(btn.dataset.direction));
    } else if (btn.hasAttribute('data-target-move')) {
      moveTarget(Number(btn.dataset.targetMove),Number(btn.dataset.direction));
    } else if (btn.hasAttribute('data-perk-ban')) {
      togglePerkBan(btn.dataset.perkBan);
    } else if (btn.hasAttribute('data-perk-move')) {
      movePerk(Number(btn.dataset.perkMove),Number(btn.dataset.direction));
    } else if (btn.hasAttribute('data-perk-remove')) {
      removePerk(Number(btn.dataset.perkRemove));
    } else if (btn.hasAttribute('data-perk-promote')) {
      addPerk(btn.dataset.perkPromote);
    } else if (btn.hasAttribute('data-perk-add')) {
      const select=$('perkAddSelect');if(select?.value)addPerk(select.value);
    }
  });
  // Mouse/trackpad drag sorting for targets and all perks (including unranked ones).
  // Up/down controls remain as keyboard/touch fallbacks.
  let sortingDrag=null;
  $('settingGroups').addEventListener('dragstart',event=>{
    if(!editable)return;
    const row=event.target.closest('[data-drag-sort]');if(!row)return;
    sortingDrag={type:row.dataset.dragSort,index:Number(row.dataset.dragIndex)};
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed='move';
    event.dataTransfer.setData('text/plain',row.dataset.dragSort+':'+row.dataset.dragIndex);
  });
  $('settingGroups').addEventListener('dragover',event=>{
    const row=event.target.closest('[data-drag-sort]');
    if(!sortingDrag||!row||row.dataset.dragSort!==sortingDrag.type)return;
    event.preventDefault();event.dataTransfer.dropEffect='move';
    document.querySelectorAll('.is-drag-over').forEach(x=>x.classList.remove('is-drag-over'));
    row.classList.add('is-drag-over');
  });
  $('settingGroups').addEventListener('drop',event=>{
    const row=event.target.closest('[data-drag-sort]');
    if(!sortingDrag||!row||row.dataset.dragSort!==sortingDrag.type)return;
    event.preventDefault();
    const from=sortingDrag.index,to=Number(row.dataset.dragIndex),type=sortingDrag.type;
    sortingDrag=null;
    document.querySelectorAll('.is-drag-over,.is-dragging').forEach(x=>x.classList.remove('is-drag-over','is-dragging'));
    if(from===to)return;
    if(type==='perk')reorderPerk(from,to);
    else if(type==='target')reorderTarget(from,to);
  });
  $('settingGroups').addEventListener('dragend',()=>{
    sortingDrag=null;
    document.querySelectorAll('.is-drag-over,.is-dragging').forEach(x=>x.classList.remove('is-drag-over','is-dragging'));
  });
  $('settingGroups').addEventListener('change',(event)=>{
    const field=event.target;
    if(field.matches('[data-source-group]')) {changeComponentSource(field.dataset.sourceGroup,field.value);return;}
    if(field.matches('[data-module-slot]')) equipModule(field.dataset.moduleSlot,Number(field.dataset.modulePos),field.value);
    else if(field.matches('[data-guardian-slot]')) equipGuardian(Number(field.dataset.guardianSlot),field.value);
  });
  $('settingGroups').addEventListener('input', (event) => {
    const input=event.target;
    if(input.matches('[data-lab-slider]') && editable) {
      const key=input.dataset.labSlider;
      const maximum=LAB_MAX[key];
      if(!maximum)return;
      const level=Math.min(maximum,Math.max(0,Math.trunc(Number(input.value)||0)));
      input.style.setProperty('--lab-progress',`${level/maximum*100}%`);
      input.setAttribute('aria-valuetext',`${level} / ${maximum} 레벨`);
      const tile=input.closest('.lab-tile');
      tile.querySelector(`[data-lab-output="${key}"]`).textContent=String(level);
      tile.classList.toggle('is-max',level===maximum);
      tile.querySelector('.lab-max-pill').hidden=level!==maximum;
      saveField(key,`Lv.${level} / ${maximum}`);
      return;
    }
    if (input.matches('[data-field]')) saveField(input.dataset.field, input.value);
  });
  $('goTopButton').addEventListener('click',()=>{
    document.querySelectorAll('.jump-button').forEach(button=>button.classList.remove('active'));
    window.scrollTo({top:0,behavior:'smooth'});
  });
  $('settingNavigation').addEventListener('click',event=>{
    const b=event.target.closest('[data-jump]');
    if(!b)return;
    $('group-'+b.dataset.jump)?.scrollIntoView({behavior:'smooth',block:'start'});
    document.querySelectorAll('.jump-button').forEach(x=>x.classList.toggle('active',x===b));
  });
  $('group-strategy').addEventListener('input',event=>{
    if(event.target.matches('[data-field="strategy"]')) saveField('strategy',event.target.value);
  });
  $('editHistoryButton').addEventListener('click',()=>{historyEditing=!historyEditing;renderHistory();});
  $('historyBody').addEventListener('change',event=>{
    if (!historyEditing) return;
    const input=event.target.closest('[data-wave-key]');if(!input || !input.isConnected)return;
    const tier=Number(input.dataset.waveTier),key=input.dataset.waveKey;
    if(!['attack','health','coin','ultimate'].includes(key)||!Number.isInteger(tier))return;
    const row=waveRows.find(x=>Number(x.tier)===tier);if(!row)return;
    const raw=input.value.trim(),number=Number(raw);
    if(raw!==''&&(!Number.isInteger(number)||number<0||number>999999)){
      toast('0~999999 범위의 정수 웨이브만 입력할 수 있습니다.');input.value=row[key]??'';return;
    }
    row[key]=raw===''?null:number;
    sourceName='사용자 수동 편집';
    $('historySource').textContent=`기록 출처: ${sourceName}`;
    persist();
  });
  $('datButton').addEventListener('click',()=>$('datFile').click());
  $('datFile').addEventListener('change',event=>importAllowedDat(event.target.files?.[0]));
  $('datTopButton').addEventListener('click',()=>$('datFile').click());
  $('waveInterval').addEventListener('change',renderGrowthTable);
  $('themeButton').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('editButton').addEventListener('click', () => { if (editable) finishEdit(); else beginEdit(); });
  $('cancelEditButton').addEventListener('click', cancelEdit);
  $('resetButton').addEventListener('click', () => {
    if (!confirm(`${current().label} 프리셋을 처음 기록된 기본값으로 되돌리시겠습니까?`)) return;
    const fresh=clone(DEFAULTS.find(p=>p.id===active));
    fresh.componentSources=Object.fromEntries(COMPONENT_GROUPS.map(group=>[group,'custom']));
    fresh.customSourceValues=Object.fromEntries(COMPONENT_GROUPS.map(group=>[group,captureSection(fresh,group)]));
    presets[presets.findIndex(p=>p.id===active)]=fresh;
    persist(); renderDetails(); toast('현재 프리셋을 직접 설정으로 초기화했습니다. 다른 연결 프리셋은 유지됩니다.');
  });
  $('exportButton').addEventListener('click', exportJson);
  $('importButton').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', event => importJson(event.target.files?.[0]));
  $('copyButton').addEventListener('click', copySummary);
  $('compareButton').addEventListener('click', openCompare);
  $('closeCompareButton').addEventListener('click', closeCompare);
  $('compareA').addEventListener('change', renderComparison);
  $('compareB').addEventListener('change', renderComparison);

  $('brandHome').addEventListener('click',event=>{event.preventDefault();setActive('farm');});
  renderNavigation();
  renderDetails();
  renderHistory();
  renderGrowthChart();
  renderGrowthTable();
  showActiveView();
})();
