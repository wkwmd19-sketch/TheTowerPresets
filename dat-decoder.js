/* The Tower Idle personal, local-only TDS1 save reader.
   Historic v0.12.0 TheTowerSDK TDS1 container algorithm (MIT),
   with an independent, read-only NRBF parser and allowlisted data extraction.
   No file is sent over a network. */
(() => {
  'use strict';
  const MAGIC = [0x54,0x44,0x53,0x31];
  const MASK_KEY = new Uint8Array([0x35,0x57,0x9b,0x22,0x8d,0xb6,0x1a,0x72,0xec,0x95,0xc0,0x97,0x80,0x20,0x2a,0x9b,0xfa,0xcb,0x0c,0x74,0x0c,0x05,0x2b,0xd4,0xe8,0x3b,0xe8,0x82,0xf3,0xd8,0xec,0x5d]);
  const isDat = bytes => bytes.length>53 && MAGIC.every((b,i)=>bytes[i]===b);
  function keys() {
    const encryption=new Uint8Array(32),authentication=new Uint8Array(32);
    let primary=2654435761,secondary=668265263;
    for(let i=0;i<32;i++){
      primary=Math.imul(primary^(7+i*131),2654435761)>>>0;
      primary=(primary^(primary>>>15))>>>0;
      encryption[i]=(i*29+primary)&255;
      secondary=Math.imul(((secondary>>>25)|(secondary<<7))^(11+i*97),0x9e37)>>>0;
      authentication[i]=((i*53)^(secondary>>>11))&255;
    }
    return {encryption,authentication};
  }
  function unmask(bytes){
    let state=2166136261;
    for(const b of MASK_KEY)state=Math.imul(state^b,16777619)>>>0;
    for(let i=0;i<bytes.length;i++){
      state=(Math.imul(state,1664525)+MASK_KEY[i&31]+1013904223)>>>0;
      const m=(MASK_KEY[(i*5+3)&31]^(state>>>24)^(state>>>9))&255;
      const shift=(state>>>6)&7;
      const rotated=((bytes[i]>>>shift)|(bytes[i]<<(8-shift)))&255;
      bytes[i]=(((rotated-(state>>>13))&255)^m);
    }
    return bytes;
  }
  async function unlockSave(input){
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
    if(bytes.byteLength>8*1024*1024)throw new Error('8MB를 초과하는 파일은 지원하지 않습니다.');
    if(!isDat(bytes))throw new Error('TDS1 형식이 아닙니다. The Tower playerInfo.dat 파일을 선택해 주세요.');
    if(bytes[4]!==1||(bytes.length-53)%16!==0||bytes.length<69)throw new Error('지원되지 않는 버전이거나 파일이 손상됐습니다.');
    if(!globalThis.crypto?.subtle)throw new Error('파일 복호화 기능이 비활성화돼 있습니다. Chrome/Edge 또는 localhost에서 열어 주세요.');
    const k=keys(),subtle=globalThis.crypto.subtle;
    const authenticated=new Uint8Array(bytes.length-36);
    authenticated.set(bytes.slice(4,21));authenticated.set(bytes.slice(53),17);
    const macKey=await subtle.importKey('raw',k.authentication,{name:'HMAC',hash:'SHA-256'},false,['verify']);
    if(!await subtle.verify('HMAC',macKey,bytes.slice(21,53),authenticated))throw new Error('무결성 검증에 실패했습니다. 저장 파일이 손상됐거나 저장 형식이 바뀌었습니다.');
    const key=await subtle.importKey('raw',k.encryption,'AES-CBC',false,['decrypt']);
    let dec;
    try{dec=new Uint8Array(await subtle.decrypt({name:'AES-CBC',iv:bytes.slice(5,21)},key,bytes.slice(53)));}
    catch {throw new Error('저장 파일 복호화에 실패했습니다.');}
    return unmask(dec);
  }
  async function inflate(raw){
    if(raw[0]!==0x1f||raw[1]!==0x8b) return raw;
    if(!globalThis.DecompressionStream)throw new Error('GZIP 지원 브라우저가 필요합니다. Chrome/Edge에서 열어 주세요.');
    const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  class Ref {constructor(id){this.id=id;}}
  class NullRun {constructor(count){this.count=count;}}
  class Nrbf {
    constructor(d){this.d=d;this.dv=new DataView(d.buffer,d.byteOffset,d.byteLength);this.p=0;this.objs=new Map();this.met=new Map();this.ended=false;}
    take(n){if(n<0||this.p+n>this.d.length)throw new Error('NRBF 끝을 벗어났습니다. byte '+this.p);const a=this.p;this.p+=n;return a;}
    u8(){return this.dv.getUint8(this.take(1));} i8(){return this.dv.getInt8(this.take(1));}
    i16(){return this.dv.getInt16(this.take(2),true);} u16(){return this.dv.getUint16(this.take(2),true);}
    i32(){return this.dv.getInt32(this.take(4),true);} u32(){return this.dv.getUint32(this.take(4),true);}
    i64(){return this.dv.getBigInt64(this.take(8),true);} u64(){return this.dv.getBigUint64(this.take(8),true);}
    f32(){return this.dv.getFloat32(this.take(4),true);} f64(){return this.dv.getFloat64(this.take(8),true);}
    str(){let len=0,done=false;for(let i=0;i<5;i++){const b=this.u8();len+=(b&127)*2**(7*i);if((b&128)===0){done=true;break;}}
      if(!done||len>8*1024*1024)throw new Error('NRBF 문자열 길이가 유효하지 않습니다.');const st=this.take(len);return new TextDecoder().decode(this.d.subarray(st,st+len));}
    primitive(t){switch(t){
      case 1:return this.u8()!==0;case 2:return this.u8();case 3:return String.fromCharCode(this.u16());
      case 5:return parseFloat(this.str());case 6:return this.f64();case 7:return this.i16();case 8:return this.i32();
      case 9:return this.i64();case 10:return this.i8();case 11:return this.f32();case 12:return Number(this.i64())/10000;
      case 13:{const ticks=(this.i64()&0x3fffffffffffffffn)-621355968000000000n;const ms=Number(ticks/10000n);
        try{return new Date(ms).toISOString();}catch{return ms;}}
      case 14:return this.u16();case 15:return this.u32();case 16:return this.u64();case 17:return null;
      default:throw new Error('알 수 없는 NRBF 값 형식: '+t+' @'+this.p);
    }}
    classInfo(){const oid=this.i32(),name=this.str(),count=this.i32();if(count<0||count>50000)throw new Error('클래스 필드 수 오류');
      return {oid,name,names:Array.from({length:count},()=>this.str())};}
    types(n){const types=Array.from({length:n},()=>this.u8()),extra=[];
      for(const t of types){if(t===0||t===7)extra.push(this.u8());else if(t===3)extra.push(this.str());else if(t===4)extra.push([this.str(),this.i32()]);else extra.push(null);}
      return {types,extra};}
    members(obj,info,types,extra){for(let i=0;i<info.names.length;i++){
      let value;if(types[i]===0)value=this.primitive(extra[i]);else{let rec=this.record();if(rec.type===12)rec=this.record();value=rec.value;}
      obj[info.names[i]]=value;
    }}
    untyped(obj,info){if(info.name==='System.Guid'&&info.names.length===11){const vals=[this.i32(),this.i16(),this.i16(),...Array.from({length:8},()=>this.u8())];
      ['_a','_b','_c','_d','_e','_f','_g','_h','_i','_j','_k'].forEach((x,i)=>obj[x]=vals[i]);
    }else if(info.names.length===1&&info.names[0]==='value__')obj.value__=this.i32();
    else throw new Error('지원되지 않는 NRBF 필드: '+info.name);}
    classRecord(t){
      if(t===1){const oid=this.i32(),id=this.i32(),metadata=this.met.get(id);if(!metadata)throw new Error('클래스 참조가 없습니다. '+id);
        const {info,types,extra}=metadata,obj={typeName:info.name};this.objs.set(oid,obj);
        if(types)this.members(obj,info,types,extra);else this.untyped(obj,info);return obj;}
      const info=this.classInfo();if(t===3)this.i32();let ty=null;
      if(t===4||t===5){ty=this.types(info.names.length);if(t===5)this.i32();}
      this.met.set(info.oid,{info,types:ty?.types,extra:ty?.extra});const obj={typeName:info.name};this.objs.set(info.oid,obj);
      if(ty)this.members(obj,info,ty.types,ty.extra);else this.untyped(obj,info);return obj;
    }
    singleArray(t){const oid=this.i32(),n=this.i32();if(n<0||n>5000000)throw new Error('배열 길이 오류');const arr=new Array(n).fill(null);
      if(t===15){const typ=this.u8();for(let i=0;i<n;i++)arr[i]=this.primitive(typ);}
      else for(let i=0;i<n;){let rec=this.record();if(rec.type===12)rec=this.record();const v=rec.value;
        if(v instanceof NullRun){if(v.count<1||v.count>n-i)throw new Error('Null run 오류');i+=v.count;}
        else{arr[i]=v;i++;}}
      this.objs.set(oid,arr);return arr;
    }
    binaryArray(){const oid=this.i32(),mode=this.u8(),rank=this.i32();if(rank<1||rank>8)throw new Error('배열 rank 오류');
      const sizes=Array.from({length:rank},()=>this.i32());if(sizes.some(n=>n<0||n>5000000))throw new Error('배열 size 오류');
      if(mode>=3&&mode<=5)for(let i=0;i<rank;i++)this.i32();const bt=this.u8();let prim=null;
      if(bt===0||bt===7)prim=this.u8();else if(bt===3||bt===4){this.str();if(bt===4)this.i32();}
      const len=sizes.reduce((a,b)=>a*b,1);if(len>5000000)throw new Error('배열 용량 초과');const flat=new Array(len).fill(null);
      if(bt===0&&mode!==1&&prim!==null){for(let i=0;i<len;i++)flat[i]=this.primitive(prim);}
      else for(let i=0;i<len;){let rec=this.record();if(rec.type===12)rec=this.record();const v=rec.value;
        if(v instanceof NullRun){if(v.count<1||v.count>len-i)throw new Error('배열 null 길이 오류');i+=v.count;}
        else{flat[i]=v;i++;}}
      const nested=(a,sz)=>{if(sz.length===1)return a;const stride=sz.slice(1).reduce((x,y)=>x*y,1);
        return Array.from({length:sz[0]},(_,i)=>nested(a.slice(i*stride,(i+1)*stride),sz.slice(1)));};
      const arr=nested(flat,sizes);this.objs.set(oid,arr);return arr;
    }
    record(){const t=this.u8();let v;
      if(t>=1&&t<=5)v=this.classRecord(t);
      else if(t===6){const id=this.i32();v=this.str();this.objs.set(id,v);}
      else if(t===7)v=this.binaryArray();
      else if(t===8)v=this.primitive(this.u8());
      else if(t===9){const id=this.i32();v=this.objs.has(id)?this.objs.get(id):new Ref(id);}
      else if(t===10)v=null;
      else if(t===11){this.ended=true;v=null;}
      else if(t===12){this.i32();this.str();v=null;}
      else if(t===13)v=new NullRun(this.u8());
      else if(t===14)v=new NullRun(this.i32());
      else if(t>=15&&t<=17)v=this.singleArray(t);
      else throw new Error('지원되지 않는 NRBF 레코드 '+t+' 위치 '+(this.p-1));
      return {type:t,value:v};
    }
    parse(){if(this.u8()!==0)throw new Error('유효하지 않은 NRBF 헤더');const root=this.i32();this.i32();const major=this.i32(),minor=this.i32();
      if(major!==1||minor!==0)throw new Error('알 수 없는 NRBF 버전');
      while(!this.ended)this.record();if(this.p!==this.d.length)throw new Error('NRBF 길이 불일치');return this.toPlain(this.objs.get(root));}
    toPlain(root){const seen=new Set();const convert=v=>{
      if(v instanceof Ref)return this.objs.has(v.id)?convert(this.objs.get(v.id)):null;
      if(v instanceof NullRun)return Array(v.count).fill(null);
      if(v===null||v===undefined)return null;
      if(typeof v==='bigint')return Number(v);
      if(typeof v!=='object')return v;
      if(seen.has(v))return '[Circular]';seen.add(v);
      const out=Array.isArray(v)?v.map(convert):Object.fromEntries(Object.entries(v).map(([k,val])=>[k,convert(val)]));
      seen.delete(v);return out;
    };return convert(root);}
  }
  function saveList(value) {
    if (!value || !Array.isArray(value._items) || !Number.isInteger(value._size))
      return null;
    if (value._size < 25 || value._size > value._items.length)
      return null;
    return value._items.slice(0, value._size);
  }
  function extractBattleRecords(root, fileName) {
    if (!root || root.typeName !== 'SaveLoad+PlayerData')
      throw new Error('이 파일은 지원하는 The Tower 저장 데이터가 아닙니다.');
    const names = [
      'dissonanceDamageBoost', 'dissonanceHealthBoost',
      'dissonanceCoinBoost', 'dissonanceUltDamageBoost'
    ];
    const series = names.map(name => saveList(root[name]));
    if (series.some(values => !values))
      throw new Error('불협 기록 4종을 찾지 못했습니다. 게임 저장 파일인지 확인해 주세요.');
    const keys = ['attack', 'health', 'coin', 'ultimate'];
    const waves = Array.from({length:24}, (_, index) => {
      const tier = index + 1;
      const record = {tier};
      for (let i = 0; i < 4; i++) {
        const raw = series[i][tier];
        if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0 || raw > 999999)
          throw new Error(`T${tier} 불협 기록에 올바르지 않은 값이 있습니다.`);
        record[keys[i]] = raw === 0 ? null : raw;
      }
      return record;
    });
    return {source:fileName, waves};
  }
  // Import only four explicitly supported domains: battle waves, in-game
  // workshop presets, bot presets, guardian presets, and card presets.
  // Module presets, lab, targeting, perks and personal operating strategy
  // are intentionally NOT decoded into import updates.
  const GAME_PRESET_COUNT=5;
  const WORKSHOP_LABELS={
    attack:['대미지','공속','치확','치명타 확률','공격 범위','대미지/미터','멀티샷 확률','멀티샷 표적','고속 발사 확률','고속 발사 지속 시간','바운스 샷 확률','바운스 샷 표적','바운스 샷 범위','슈퍼 치명타 확률','슈퍼 치명타 승수','방어구 가르기 확률','방어구 가르기 승수'],
    defense:['체력','체력 재생','방어 %','절대 방어','가시 대미지','생명력 흡수','넉백 확률','넉백 강도','오브 속도','오브 수','충격파 크기','충격파 빈도','지뢰 확률','지뢰 대미지','지뢰 반경','죽음 저항','장벽 체력','장벽 재건'],
    utility:['캐시 보너스','캐시/웨이브','코인/처치 보너스','코인/웨이브','무료 공격 업그레이드','무료 방어 업그레이드','무료 유틸리티 업그레이드','이익/웨이브','최대량','최대 회복','패키지 확률','적 공격 레벨 건너뛰기','적 체력 레벨 건너뛰기'],
    enhanceAttack:['대미지+','방어구 가르기+','치명타 계수+','대미지/미터+','슈퍼 치명타 승수+','공격 속도+'],
    enhanceDefense:['체력+','체력 재생+','절대 방어+','지뢰 대미지+','장벽 체력+','오브 크기'],
    enhanceUtility:['캐시 보너스+','코인 보너스+','셀/처치 보너스+','무료 업그레이드+','회복 패키지+','적 레벨 건너뛰기+']
  };
  const CARDS_BY_ID=['대미지','공속','체력','체젠','범위','캐시','코인','저속오라',null,null,'치확','적밸','방어','포트리스',null,'무료업','추옵',null,'대포','치코','웨건뛰','인트로','지뢰기절','패확',null,'죽광','네트','슈타','세컨','데몬','에쉴','웨엑','광전사','궁치','핵','광역공격',null,'셀',null,null];
  const BOT_SAVE_FIELDS=[['goldenBotPresets','골봇'],['botBotPresets','봇봇'],['amplifyBotPresets','증폭봇'],['flameBotPresets','화염봇'],['thunderBotPresets','천둥봇']];
  const GUARDIAN_BY_ENUM=['현상금','투사체 가로채기','공격','위협','돌격','동맹','회수','소환','정찰'];
  function strictMatrix(root,key,minRows){
    const matrix=root[key];
    if(!Array.isArray(matrix)||matrix.length<minRows||matrix.slice(0,minRows).some(row=>!Array.isArray(row)))
      throw new Error(`게임 저장파일의 '${key}' 프리셋 배열을 읽을 수 없습니다.`);
    return matrix;
  }
  function levelsString(row,labels){
    if(!Array.isArray(row)||row.length<labels.length)throw new Error('저장된 작업장 레벨 수가 예상과 다릅니다.');
    return labels.flatMap((name,index)=>{
      const level=row[index];
      if(!Number.isSafeInteger(level)||level<0||level>100000)throw new Error('유효하지 않은 작업장 레벨을 발견했습니다.');
      return level>0 ? [`${name} Lv.${level}`] : [];
    }).join(' · ');
  }
  function readWorkshopPresets(root){
    const matrices={
      attack:strictMatrix(root,'presetUpgradeWorkshopLevel',GAME_PRESET_COUNT),
      defense:strictMatrix(root,'presetUpgradeWorkshopDefenseLevel',GAME_PRESET_COUNT),
      utility:strictMatrix(root,'presetUpgradeWorkshopUtilityLevel',GAME_PRESET_COUNT),
      enhanceAttack:strictMatrix(root,'presetEnhancementLevel',GAME_PRESET_COUNT),
      enhanceDefense:strictMatrix(root,'presetEnhancementDefenseLevel',GAME_PRESET_COUNT),
      enhanceUtility:strictMatrix(root,'presetEnhancementUtilityLevel',GAME_PRESET_COUNT)
    };
    return Array.from({length:GAME_PRESET_COUNT},(_,index)=>{
      const fields={};
      for(const key of ['attack','defense','utility'])fields[key]=levelsString(matrices[key][index],WORKSHOP_LABELS[key]);
      fields.extras=['enhanceAttack','enhanceDefense','enhanceUtility'].map(key=>levelsString(matrices[key][index],WORKSHOP_LABELS[key])).filter(Boolean).join('\n');
      return {fields};
    });
  }
  function botRow(root,key){
    const holder=root[key];
    if(!holder||!Array.isArray(holder._items)||!Number.isInteger(holder._size)||holder._size<GAME_PRESET_COUNT)
      throw new Error(`봇 프리셋 '${key}'이 5개 미만입니다.`);
    return holder._items.slice(0,GAME_PRESET_COUNT);
  }
  function readBotPresets(root){
    const bots=BOT_SAVE_FIELDS.map(([key,name])=>[name,botRow(root,key)]);
    return Array.from({length:GAME_PRESET_COUNT},(_,index)=>{
      const enabled=[],botStats={};
      for(const [name,rows] of bots){
        const row=rows[index];
        if(!row||!Array.isArray(row.levels)||row.levels.length<4||!Array.isArray(row.selectedLevels)||row.selectedLevels.length<4)
          throw new Error(`봇 '${name}'의 ${index+1}번 저장값을 확인할 수 없습니다.`);
        if(row.active===true)enabled.push(name);
        const levels=row.selectedLevels.map((n,i)=>Math.max(Number(n)||0,Number(row.levels[i])||0)).slice(0,4);
        if(levels.some(n=>!Number.isSafeInteger(n)||n<0||n>500))throw new Error('봇 레벨이 올바르지 않습니다.');
        const plusLevel=Number(row.plusLevel);
        if(!Number.isSafeInteger(plusLevel)||plusLevel<0||plusLevel>50)throw new Error('봇+ 레벨이 올바르지 않습니다.');
        botStats[name]={levels:[levels[3],levels[2],levels[0],levels[1]],plusLevel,plusUnlocked:row.plusUnlocked===true};
      }
      return {fields:{bot1:enabled.join(' · ')},botStats};
    });
  }
  function readCardPresets(root){
    const indices=strictMatrix(root,'slotPresetCardInt',GAME_PRESET_COUNT);
    const assigned=strictMatrix(root,'slotPresetCardAssignedBool',GAME_PRESET_COUNT);
    const cards=Array.from({length:GAME_PRESET_COUNT},(_,index)=>{
      if(indices[index].length!==assigned[index].length)throw new Error('카드 프리셋 배열 길이가 다릅니다.');
      const selected=[];
      indices[index].forEach((cardId,slot)=>{
        if(assigned[index][slot]!==true)return;
        if(!Number.isInteger(cardId)||!CARDS_BY_ID[cardId])throw new Error(`알 수 없는 장착 카드 ID ${cardId}를 발견했습니다.`);
        selected.push(CARDS_BY_ID[cardId]);
      });
      if(selected.length>25)throw new Error('카드 프리셋의 장착 슬롯이 25개를 초과합니다.');
      return {fields:{cards:selected.join(', ')}};
    });
    const mastery=root.cardMasteryUnlocked;
    return {cards,masteredCards:Array.isArray(mastery)?mastery.flatMap((v,i)=>v===true&&CARDS_BY_ID[i]?[CARDS_BY_ID[i]]:[]):null};
  }
  function readGuardianPresets(root){
    const holder=root.guardianPresets;
    if(!holder||!Array.isArray(holder._items)||!Number.isInteger(holder._size))throw new Error('가디언 프리셋을 찾을 수 없습니다.');
    const candidates=holder._items.slice(0,holder._size).filter(row=>row&&typeof row.presetName==='string'&&row.chipSlot?.some(x=>Number(x?.value__)>=0));
    if(candidates.length<2)throw new Error('장착 가디언이 있는 프리셋 2개를 찾을 수 없습니다.');
    return candidates.map(row=>{
      const slotValues=row.chipSlot.slice(0,2).map(x=>Number(x?.value__));
      if(slotValues.some(v=>!Number.isInteger(v)||v < -1||v >= GUARDIAN_BY_ENUM.length))throw new Error('지원하지 않는 가디언 칩 번호가 있습니다.');
      return {name:row.presetName,fields:{guardian:slotValues.map(v=>v===-1?'':GUARDIAN_BY_ENUM[v]).join(' | ').replace(/^\s*\|\s*|\s*\|\s*$/g,'').trim()}};
    });
  }
  function extractAllowedGameData(root,fileName){
    const battles=extractBattleRecords(root,fileName);
    if(!Array.isArray(root.presetName)||root.presetName.length<GAME_PRESET_COUNT||
       root.presetName.slice(0,GAME_PRESET_COUNT).some(name=>typeof name!=='string'))
      throw new Error('인게임 프리셋 이름 5개를 확인할 수 없습니다.');
    const workshop=readWorkshopPresets(root),bots=readBotPresets(root),cardData=readCardPresets(root);
    const guardian=readGuardianPresets(root);
    return {
      source:fileName,
      waves:battles.waves,
      gameNames:root.presetName.slice(0,GAME_PRESET_COUNT),
      banks:{workshop,bots,cards:cardData.cards,guardian:guardian.map(({fields})=>({fields}))},
      guardianNames:guardian.map(g=>g.name),
      masteredCards:cardData.masteredCards
    };
  }
  async function readAllowedGameData(file){
    if(!file||file.size>8*1024*1024)throw new Error('8MB 이하의 유효한 DAT 파일을 선택해 주세요.');
    const encrypted=new Uint8Array(await file.arrayBuffer());
    const root=new Nrbf(await inflate(await unlockSave(encrypted))).parse();
    return extractAllowedGameData(root,file.name);
  }

  async function readBattleRecords(file) {
    if (!file || file.size > 8*1024*1024)
      throw new Error('8MB 이하의 유효한 DAT 파일을 선택해 주세요.');
    const encrypted = new Uint8Array(await file.arrayBuffer());
    const raw = await unlockSave(encrypted);
    const inflated = await inflate(raw);
    const root = new Nrbf(inflated).parse();
    return extractBattleRecords(root, file.name);
  }
  globalThis.TowerDatReader = Object.freeze({readBattleRecords,readAllowedGameData});
})();
