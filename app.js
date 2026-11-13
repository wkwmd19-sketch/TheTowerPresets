(() => {
  'use strict';
  const STORAGE_KEY = 'the-tower-idle-preset-archive:v1';
  const THEME_KEY = 'the-tower-idle-preset-theme:v1';
  const DEFAULTS = window.TOWER_DEFAULT_PRESETS;
  const GROUPS = window.TOWER_GROUPS;
  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fieldLabels = Object.fromEntries(GROUPS.flatMap(group => group.fields));
  const allKeys = Object.keys(fieldLabels);
  let editable = false;
  let comparing = false;
  let active = 'farm';
  let toastTimer = null;
  let canPersist = true;

  function normalize(parsed) {
    if (!parsed || !Array.isArray(parsed.presets)) return clone(DEFAULTS);
    return DEFAULTS.map(defaultPreset => {
      const found = parsed.presets.find(p => p && p.id === defaultPreset.id);
      if (!found || !found.fields || typeof found.fields !== 'object') return clone(defaultPreset);
      const next = clone(defaultPreset);
      for (const key of allKeys) {
        if (typeof found.fields[key] === 'string') next.fields[key] = found.fields[key].slice(0,10000);
      }
      return next;
    });
  }
  function load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? normalize(JSON.parse(stored)) : clone(DEFAULTS);
    } catch (error) { canPersist = false; return clone(DEFAULTS); }
  }
  let presets = load();
  function current() { return presets.find(p => p.id === active) || presets[0]; }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion:1, presets }));
      canPersist = true;
      $('saveStatus').innerHTML = '<span class="status-dot"></span> 저장됨';
    } catch (error) {
      canPersist = false;
      $('saveStatus').innerHTML = '<span class="status-dot"></span> 저장 불가 · JSON 백업 권장';
      toast('브라우저 저장 공간을 사용할 수 없습니다. JSON 백업을 이용하세요.');
    }
  }
  function toast(message) {
    const el = $('toast'); el.textContent = message;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function setTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    $('themeButton').setAttribute('aria-label', next === 'dark' ? '화이트 테마로 전환' : '블랙 테마로 전환');
    try { localStorage.setItem(THEME_KEY,next); } catch (_) {}
  }
  try { setTheme(localStorage.getItem(THEME_KEY) || 'dark'); } catch (_) { setTheme('dark'); }

  function renderNavigation() {
    $('sideNav').innerHTML = presets.map((p,i) => `
      <button type="button" class="side-link ${p.id===active?'active':''}" data-preset="${p.id}" aria-current="${p.id===active?'page':'false'}">
        <span class="side-num">${String(i+1).padStart(2,'0')}</span><span class="side-text"><span class="side-name">${escapeHtml(p.name)}</span><span class="side-sub">${escapeHtml(p.label)}</span></span><span class="side-arrow">›</span></button>`).join('');
    $('presetGrid').innerHTML = presets.map((p,i) => `
      <button type="button" class="preset-card ${p.id===active?'active':''}" data-preset="${p.id}" aria-pressed="${p.id===active?'true':'false'}">
        <span class="card-top"><span class="card-number">PRESET / ${String(i+1).padStart(2,'0')}</span><span class="card-mark">${p.id===active?'●':'↗'}</span></span>
        <span class="card-content"><strong class="card-name">${escapeHtml(p.name)}</strong><span class="card-label">${escapeHtml(p.label)}</span></span><span class="card-bottom"></span></button>`).join('');
  }
  function fieldView(group, key, label, value) {
    const safeLabel = escapeHtml(label);
    if (editable) {
      return `<div class="setting-field"><label class="field-label" for="edit-${key}">${safeLabel}</label><textarea id="edit-${key}" class="field-editor" rows="${group.id==='cards'?4:group.id==='modules'||group.id==='notes'?2:1}" data-field="${key}" placeholder="설정을 입력하세요">${escapeHtml(value)}</textarea></div>`;
    }
    if (group.id === 'cards' && value) {
      const cards = value.split(',').map(t=>t.trim()).filter(Boolean);
      return `<div class="setting-field"><span class="field-label">${safeLabel} · ${cards.length}개</span><div class="field-cardchips">${cards.map((card,i)=>`<span class="card-chip"><em>${String(i+1).padStart(2,'0')}</em>${escapeHtml(card)}</span>`).join('')}</div></div>`;
    }
    return `<div class="setting-field"><span class="field-label">${safeLabel}</span><div class="field-value ${value?'':'field-empty'}">${value?escapeHtml(value):'미기록'}</div></div>`;
  }
  function renderDetails() {
    const p = current();
    const index = presets.findIndex(x=>x.id===p.id);
    $('headIndex').textContent = String(index+1).padStart(2,'0');
    $('headType').textContent = p.type;
    $('detailsTitle').textContent = p.name;
    $('headDesc').textContent = p.description;
    $('saveStatus').innerHTML = `<span class="status-dot"></span> ${canPersist?'저장됨':'저장 불가'}`;
    $('editButton').textContent = editable ? '✓ 편집 완료' : '✎ 세팅 편집';
    $('editToolbar').classList.toggle('hidden', !editable);
    const search = $('searchField').value.trim().toLocaleLowerCase();
    const matching = GROUPS.map(group => ({
      group,
      fields:group.fields.filter(([key,label]) => !search || [group.title,group.subtitle,label,p.fields[key] || ''].some(v=>v.toLocaleLowerCase().includes(search)))
    })).filter(({fields})=>fields.length);
    $('settingGroups').innerHTML = matching.length ? matching.map(({group,fields}) => `
      <section class="setting-group group-${group.id}" data-columns="${group.columns}" aria-label="${escapeHtml(group.title)}">
        <div class="group-heading"><span class="group-number">${group.number}</span><span class="group-title-block"><h4>${escapeHtml(group.title)}</h4><small>${escapeHtml(group.subtitle)}</small></span></div>
        <div class="field-grid">${fields.map(([key,label])=>fieldView(group,key,label,p.fields[key] || '')).join('')}</div>
      </section>`).join('') : '<div class="no-results">일치하는 설정이 없습니다. 다른 검색어를 입력해 보세요.</div>';
    const count = matching.reduce((total,x)=>total+x.fields.length,0);
    $('settingsCount').textContent = `${count} / ${allKeys.length} ITEMS`;
  }
  function setActive(id) {
    if (!presets.some(p=>p.id===id)) return;
    active = id;
    $('searchField').value = '';
    if (comparing) closeCompare();
    renderNavigation();renderDetails();
    $('details').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function saveField(key, value) {
    if (!allKeys.includes(key)) return;
    current().fields[key] = value.slice(0,10000);
    persist();
  }
  function renderComparison() {
    const a = presets.find(p=>p.id===$('compareA').value) || presets[0];
    const b = presets.find(p=>p.id===$('compareB').value) || presets[1];
    $('comparisonContent').innerHTML = `<table class="comparison-table"><thead><tr><th>항목</th><th>${escapeHtml(a.name)}</th><th>${escapeHtml(b.name)}</th></tr></thead><tbody>${GROUPS.map(group => `<tr class="comparison-section"><td colspan="3">${escapeHtml(group.number+' / '+group.title)}</td></tr>${group.fields.map(([key,label]) => {
      const aa=a.fields[key]||'미기록';const bb=b.fields[key]||'미기록';
      return `<tr class="${aa!==bb?'diff':''}"><td>${escapeHtml(label)}</td><td>${escapeHtml(aa)}</td><td>${escapeHtml(bb)}</td></tr>`;
    }).join('')}`).join('')}</tbody></table>`;
  }
  function openCompare() {
    comparing=true;editable=false;
    $('detailsPanel').classList.add('hidden');
    $('comparisonPanel').classList.remove('hidden');
    $('compareA').innerHTML=presets.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    $('compareB').innerHTML=$('compareA').innerHTML;
    $('compareA').value=active;
    $('compareB').value=active==='farm'?'push':'farm';
    renderComparison();
    $('details').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function closeCompare() {
    comparing=false;
    $('detailsPanel').classList.remove('hidden');
    $('comparisonPanel').classList.add('hidden');
    renderDetails();
  }
  function summaryText() {
    const p=current();
    return [`[The Tower Idle · ${p.name}]`,p.label,p.description,'',...GROUPS.flatMap(group => [
      `■ ${group.title}`,...group.fields.map(([key,label])=>`- ${label}: ${p.fields[key] || '미기록'}`),''
    ])].join('\n');
  }
  async function copySummary() {
    const text=summaryText();
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else { const box=document.createElement('textarea');box.value=text;box.style.position='fixed';box.style.left='-9999px';document.body.appendChild(box);box.select();if(!document.execCommand('copy'))throw new Error('copy');box.remove(); }
      toast('현재 프리셋의 설정을 복사했습니다.');
    } catch (_) { toast('복사할 수 없습니다. JSON 백업을 이용하세요.'); }
  }
  function exportJson() {
    const content={app:'the-tower-idle-preset-archive',schemaVersion:1,exportedAt:new Date().toISOString(),presets};
    const blob=new Blob([JSON.stringify(content,null,2)+'\n'],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;
    link.download=`the-tower-presets-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('JSON 백업 파일을 내려받았습니다.');
  }
  async function importJson(file) {
    if (!file) return;
    try {
      if (file.size > 1024*1024) throw new Error('파일이 너무 큽니다.');
      const parsed=JSON.parse(await file.text());
      if (parsed.app!=='the-tower-idle-preset-archive' || parsed.schemaVersion!==1 || !Array.isArray(parsed.presets)) throw new Error('지원하지 않는 백업 파일입니다.');
      if (!DEFAULTS.every(p=>parsed.presets.some(x=>x?.id===p.id && x.fields && typeof x.fields==='object'))) throw new Error('5개 프리셋을 포함한 백업이 아닙니다.');
      if (!confirm('현재 브라우저에 저장된 5개 프리셋을 가져온 파일의 설정으로 바꾸시겠습니까?')) return;
      presets=normalize(parsed);active='farm';editable=false;
      $('searchField').value='';if(comparing)closeCompare();
      persist();renderNavigation();renderDetails();toast('5개 프리셋을 가져왔습니다.');
    } catch (error) { toast(error instanceof SyntaxError?'JSON 파일을 읽을 수 없습니다.':error.message); }
    finally { $('importFile').value=''; }
  }

  document.addEventListener('click',(event) => {
    const target=event.target.closest('[data-preset]');
    if(target) setActive(target.dataset.preset);
  });
  $('settingGroups').addEventListener('input',(event) => {
    if (event.target.matches('[data-field]')) saveField(event.target.dataset.field,event.target.value);
  });
  $('searchField').addEventListener('input',renderDetails);
  $('themeButton').addEventListener('click',() => setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
  $('editButton').addEventListener('click',() => {editable=!editable;renderDetails();if(editable){const first=$('settingGroups').querySelector('textarea');if(first)first.focus();}});
  $('doneButton').addEventListener('click',() => {editable=false;renderDetails();toast('설정 편집을 마쳤습니다.');});
  $('resetButton').addEventListener('click',() => {
    if(!confirm(`${current().name} 프리셋을 처음 기록된 기본값으로 되돌리시겠습니까?`))return;
    presets[presets.findIndex(p=>p.id===active)]=clone(DEFAULTS.find(p=>p.id===active));
    persist();renderDetails();toast('현재 프리셋을 기본값으로 되돌렸습니다.');
  });
  $('exportButton').addEventListener('click',exportJson);
  $('importButton').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',event=>importJson(event.target.files?.[0]));
  $('copyButton').addEventListener('click',copySummary);
  $('compareButton').addEventListener('click',openCompare);
  $('closeCompareButton').addEventListener('click',closeCompare);
  $('compareA').addEventListener('change',renderComparison);
  $('compareB').addEventListener('change',renderComparison);
  renderNavigation();renderDetails();
})();
