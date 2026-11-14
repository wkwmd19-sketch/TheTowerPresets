/* 기본 설정 데이터: 확인된 사용자 기록만 입력하고, 확인되지 않은 항목은 비워 둡니다. */
window.TOWER_SCHEMA_VERSION = 12;
window.TOWER_GROUPS = [
  { id:'strategy', number:'01', title:'운영방향', columns:1, fields:[['strategy','운영 방향']] },
  { id:'workshop', number:'02', title:'작업장', columns:1, fields:[['attack','공격 업그레이드'],['defense','방어 업그레이드'],['utility','유틸리티 업그레이드'],['extras','작업장 강화']] },
  { id:'laboratory', number:'03', title:'연구실', columns:2, fields:[['labShockwave','충격파 크기'],['labRange','범위']] },
  { id:'cards', number:'04', title:'카드', columns:1, fields:[['cards','카드 구성']] },
  { id:'bots', number:'05', title:'봇', columns:1, fields:[['bot1','활성 봇']] },
  { id:'modules', number:'06', title:'모듈', columns:2, fields:[['slot1','공격'],['slot3','발전기'],['slot2','방어'],['slot4','코어']] },
  { id:'guardian', number:'07', title:'가디언', columns:1, fields:[['guardian','가디언 설정']] },
  { id:'targeting', number:'08', title:'적 우선순위', columns:1, fields:[['priority','우선순위']] },
  { id:'perks', number:'09', title:'특전', columns:1, fields:[['perks','특전 설정'],['perkOrder','자동 특전 우선순위']] }
];
window.TOWER_DEFAULT_PRESETS = [
  {
    id:'farm', name:'Farm', type:'파밍', label:'파밍',
    description:'파밍 세팅',
    fields:{ strategy:'', attack:'', defense:'', utility:'', extras:'', bot1:'', slot1:'', slot2:'', slot3:'', slot4:'', priority:'', perks:'', perkOrder:'', guardian:'', cards:'', labShockwave:'', labRange:'' }
  },
  {
    id:'push', name:'Push_Trn_DS', type:'토너 · 등반 · 방어런', label:'토너 · 등반 · 방어런',
    description:'토너먼트, 등반, 방어런 공용 세팅',
    fields:{ strategy:'', attack:'', defense:'', utility:'', extras:'', bot1:'', slot1:'', slot2:'', slot3:'', slot4:'', priority:'', perks:'', perkOrder:'', guardian:'', cards:'', labShockwave:'', labRange:'' }
  },
  {
    id:'disatk', name:'DisAtk', type:'불협 공격런', label:'불협 공격런',
    description:'불협 공격런용 세팅',
    fields:{ strategy:'', attack:'', defense:'', utility:'', extras:'', bot1:'', slot1:'', slot2:'', slot3:'', slot4:'', priority:'', perks:'', perkOrder:'', guardian:'', cards:'', labShockwave:'', labRange:'' }
  },
  {
    id:'disuw', name:'DisUW', type:'불협 궁무런', label:'불협 궁무런',
    description:'불협 궁무런용 세팅',
    fields:{ strategy:'', attack:'', defense:'', utility:'', extras:'', bot1:'', slot1:'', slot2:'', slot3:'', slot4:'', priority:'', perks:'', perkOrder:'', guardian:'', cards:'', labShockwave:'', labRange:'' }
  },
  {
    id:'disutil', name:'DisUtil', type:'불협 유틸런', label:'불협 유틸런',
    description:'불협 유틸런용 세팅',
    fields:{ strategy:'', attack:'', defense:'', utility:'', extras:'', bot1:'', slot1:'', slot2:'', slot3:'', slot4:'', priority:'', perks:'', perkOrder:'', guardian:'', cards:'', labShockwave:'', labRange:'' }
  },
  {
    id:'tournament', name:'Tournament', type:'미식 토너 전용', label:'(미식)토너먼트',
    description:'(미식)토너먼트 전용 프리셋 · 기존 저장 설정 유지',
    fields:{ strategy:'', attack:'', defense:'', utility:'', extras:'', bot1:'', slot1:'', slot2:'', slot3:'', slot4:'', priority:'', perks:'', perkOrder:'', guardian:'', cards:'', labShockwave:'', labRange:'' }
  }
];
