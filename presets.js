/* 기본 설정 데이터: 확인된 사용자 기록만 입력하고, 확인되지 않은 항목은 비워 둡니다. */
window.TOWER_SCHEMA_VERSION = 1;
window.TOWER_GROUPS = [
  { id:'workshop', number:'01', title:'작업장', subtitle:'WORKSHOP', columns:2, fields:[
    ['strategy','운영 방향'],['attack','공격'],['defense','방어'],['utility','유틸리티'],['range','범위'],['orbs','오브'],['shockwave','충격파'],['extras','추가 설정']
  ]},
  { id:'bots', number:'02', title:'봇', subtitle:'BOTS', columns:2, fields:[['bot1','메인 봇'],['bot2','서브 봇']] },
  { id:'modules', number:'03', title:'모듈', subtitle:'MODULES', columns:2, fields:[['slot1','모듈 1'],['slot2','모듈 2'],['slot3','모듈 3'],['slot4','모듈 4']] },
  { id:'targeting', number:'04', title:'타깃 우선순위', subtitle:'TARGET PRIORITY', columns:1, fields:[['priority','우선순위']] },
  { id:'perks', number:'05', title:'특전', subtitle:'PERKS', columns:1, fields:[['perks','특전 규칙']] },
  { id:'guardian', number:'06', title:'가디언', subtitle:'GUARDIAN', columns:1, fields:[['guardian','가디언 설정']] },
  { id:'ultimate', number:'07', title:'궁극무기', subtitle:'ULTIMATE WEAPONS', columns:1, fields:[['uw','궁무 설정']] },
  { id:'cards', number:'08', title:'카드', subtitle:'CARDS', columns:1, fields:[['cards','카드 구성']] },
  { id:'notes', number:'09', title:'기타 기록', subtitle:'NOTES', columns:1, fields:[['notes','추가 메모']] }
];
window.TOWER_DEFAULT_PRESETS = [
  {
    id:'farm', name:'Farm', type:'FARMING LOADOUT', label:'파밍',
    description:'30m 파밍을 기준으로 운영하는 기본 세팅',
    fields:{
      strategy:'기존 파밍 작업장 설정 유지 (30m 파밍)',
      attack:'', defense:'', utility:'추옵 30m', range:'30m',
      orbs:'39m', shockwave:'1.6',
      extras:'바샷 3종 적용 · 지뢰 반경 0.5 · 넉백 1.53',
      bot1:'골봇',bot2:'봇봇',
      slot1:'황저',slot2:'블소 + 갤압',slot3:'큐방포 + 공변기',slot4:'차코 + 원붕',
      priority:'플보엘수',perks:'별도 지정 없음',guardian:'소환 / 회수',uw:'독늪 기절 해제',
      cards:'대미지, 공속, 캐시, 코인, 저속오라, 치확, 적밸, 치코, 무료업, 추옵, 대포, 패확, 웨건뛰, 인트로, 지뢰기절, 슈타, 셀, 죽광, 네트, 웨엑, 세컨, 데몬, 에쉴, 광전사, 궁치',
      notes:'뎀슬 E-15%'
    }
  },
  {
    id:'push', name:'Push_Trn_DS',type:'PUSH / TOURNAMENT',label:'토너 · 등반 · 방어런',
    description:'토너먼트·등반·방어런을 하나로 관리하는 전투 세팅',
    fields:{
      strategy:'토너 / 등반 / 방어런 공용 프리셋',
      attack:'딜 강화',defense:'방어런: 방어 중심 설정', utility:'ELS',
      range:'토너·등반 60.95m / 방어런 최대 108m',orbs:'',shockwave:'',extras:'',
      bot1:'증폭봇 (에코샷)',bot2:'',
      slot1:'증폭일격 / 사형선고',
      slot2:'토너·등반: 프젝자 + 하네스 / 프젝자 + 펄서\n방어런: 프젝자 + 회복 보너스',
      slot3:'토너·등반: 큐방포 + 감프 / 안와 + 감프\n방어런: 안와 + 감프 / 감프 + 음질프',
      slot4:'차코 + 옴칩',
      priority:'신속 → 원거리 → 플릿 → 엘리트 (이하 변동)',
      perks:'×1.65 대미지 특전 습득',guardian:'공격 / 동맹',uw:'독늪 기절 체크',
      cards:'대미지, 공속, 캐시, 저속오라, 치확, 추옵, 대포, 인트로, 웨건뛰, 지뢰기절, 패확, 죽광, 네트, 슈타, 세컨, 데몬, 에쉴',
      notes:'토너·등반과 방어런은 같은 프리셋을 사용하지만, 범위와 모듈 2·3 조합이 다름.'
    }
  },
  {
    id:'disatk',name:'DisAtk',type:'DISCORD / ATTACK',label:'불협 공격런',
    description:'불협 공격런에서 체력·회복과 ELS를 중점 운영',
    fields:{
      strategy:'불협 공격런',attack:'',defense:'체력 + 최대 회복 강화',utility:'ELS',
      range:'',orbs:'크기 약간 증가',shockwave:'',extras:'',
      bot1:'화염봇',bot2:'천둥봇',
      slot1:'사형선고 + 증폭일격',slot2:'하네스 + 갤압 / 하네스 + 임계값',
      slot3:'안와 + 음질프',slot4:'원붕 + 하모니',
      priority:'우선순위 없음',
      perks:'체력 관련 특전 반드시 습득 · 보라 체젠 특전 금지',
      guardian:'공격 / 동맹',uw:'독늪 기절 체크',
      cards:'체력, 체젠, 저속오라, 치확, 방어, 무료업, 추옵, 대포, 웨건뛰, 인트로, 지뢰기절, 패확, 셀, 죽광, 네트, 슈타, 세컨, 데몬, 에쉴, 공속, 광전사, 궁치',
      notes:'카드 구성은 현재 확인 가능한 항목까지 반영했습니다.'
    }
  },
  {
    id:'disuw',name:'DisUW',type:'DISCORD / ULTIMATE',label:'불협 궁무런',
    description:'극대화한 작업장 범위와 궁극무기 운영 중심',
    fields:{
      strategy:'불협 궁무런',attack:'공속 ×1.8 / 공격·치명타·슈퍼 치명타 ×4.17',
      defense:'체력 ×3',utility:'캐시 ×2.5 / 무료업 ×1.5 / 적건뛰 골박',
      range:'220.09m',orbs:'120m',shockwave:'최대',extras:'',
      bot1:'증폭봇 (에코샷)',bot2:'',
      slot1:'증폭일격 + 아스트랄',slot2:'감프 + 음질프',slot3:'프젝자 + 회복 보너스',slot4:'자석후크 + 아무거나',
      priority:'Closest 고정',perks:'일반 딜 메타 동일 + ×1.65 대미지 습득',guardian:'공격 / 동맹',uw:'독늪 기절 체크',
      cards:'대미지, 공속, 체력',notes:'카드 전체 목록은 추가 확인이 필요합니다.'
    }
  },
  {
    id:'disutil',name:'DisUtil',type:'DISCORD / UTILITY',label:'불협 유틸런',
    description:'불협 유틸런을 위한 고화력 세팅',
    fields:{
      strategy:'극딜',attack:'',defense:'',utility:'',range:'60.95m',orbs:'',shockwave:'',extras:'',
      bot1:'증폭봇 (에코샷)',bot2:'',
      slot1:'증폭일격 / 사형선고',slot2:'프젝자 + 하네스 / 프젝자 + 펄서',slot3:'큐방포 + 감프',slot4:'차코 + 옴칩',
      priority:'신속 → 원거리 → 플릿 → 엘리트 (이하 변동)',perks:'유틸 특전 영향 없음 · ×1.65 대미지 습득',guardian:'공격 / 동맹',uw:'독늪 기절 체크',
      cards:'대미지, 공속, 체력, 체젠',notes:'카드 전체 목록은 추가 확인이 필요합니다.'
    }
  }
];
