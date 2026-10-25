'use strict';
const $=id=>document.getElementById(id), center=[24.1796,120.6495], KEY='campus-move-history-v1';
// Base map source is defined in tiles.js (CARTO Voyager, OpenStreetMap data). Change it there for school-wide use.
let records=[];try{records=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(records))records=[];}catch{}
let map, route, halo=null, startMarker=null, positionDot, accuracyCircle, targetMarker, targetLine, target=null, current=null;
let session=null, watch=null, demoTimer=null, wake=null, last=null, lastSignal=0, lines=[], storageOK=true;

function message(s){$('message').textContent=s;}
function pinIcon(kind,label){return L.divIcon({className:'map-pin-wrap map-pin-'+kind,html:'<span class="pin-body"><b>'+label+'</b></span>',iconSize:[30,30],iconAnchor:[15,30]});}
function setTrack(lines){if(route)route.setLatLngs(lines);if(halo)halo.setLatLngs(lines);}
function clearStart(){if(startMarker&&map)map.removeLayer(startMarker);startMarker=null;}
function setStart(p){clearStart();if(map)startMarker=L.marker([p.lat,p.lng],{icon:pinIcon('start','起'),zIndexOffset:500}).addTo(map).bindTooltip('起點');}

try{
  map=L.map('map',{zoomControl:false}).setView(center,17);
  L.control.zoom({position:'bottomright'}).addTo(map);
  addBaseMap(map).on('tileerror',()=>message('底圖載入失敗，請檢查網路；Google / OSM 圖資可能暫時不可用。'));
  halo=L.polyline([], {color:'#fff', weight:12, opacity:0.55, lineCap:'round', lineJoin:'round'}).addTo(map);
  route=L.polyline([], {color:'#d95432', weight:5, lineCap:'round', lineJoin:'round'}).addTo(map);
  map.on('click', e => { target={lat:e.latlng.lat,lng:e.latlng.lng}; updateTarget(); });
}catch(err){message('地圖初始化失敗：' + err.message);}

function updateTarget(){
  if(!target){
    $('navigate').hidden=true;
    $('targetInfo').textContent='點一下地圖，設定老師指定的集合點。';
    return;
  }
  const info='集合點已設定（依老師指定位置）';
  $('targetInfo').textContent=info;
  $('navigate').hidden=false;
  if(!targetMarker&&map){targetMarker=L.marker([target.lat,target.lng],{icon:pinIcon('target','集'),zIndexOffset:600}).addTo(map).bindTooltip('集合點');}
  if(targetMarker&&map){targetMarker.setLatLng([target.lat,target.lng]);}
  if(current&&map){
    if(targetLine&&map) map.removeLayer(targetLine);
    targetLine=L.polyline([[current.lat,current.lng],[target.lat,target.lng]],{color:'#a97b4b',dashArray:'6 8',weight:2}).addTo(map);
  }
}

function clearTarget(){target=null;for(const l of [targetMarker,targetLine])if(l&&map)map.removeLayer(l);targetMarker=targetLine=null;updateTarget();}
$('clearTarget').onclick=clearTarget;$('campus').onclick=()=>map&&map.setView(center,17);

function displayPosition(p){
  current=p;
  if(map){
    const ll=[p.lat,p.lng];
    if(!positionDot){
      positionDot=L.circleMarker(ll,{radius:7,color:'white',weight:3,fillColor:'#2f88b3',fillOpacity:1}).addTo(map);
      accuracyCircle=L.circle(ll,{radius:p.accuracy,color:'#2f88b3',weight:1,fillOpacity:0.08}).addTo(map);
    } else {
      positionDot.setLatLng(ll);
      accuracyCircle.setLatLng(ll).setRadius(p.accuracy);
    }
  }
  $('accuracy').textContent=Math.round(p.accuracy)+' m';
  updateTarget();
}

const GEO_REASONS={
  1:'定位權限被拒絕：請到瀏覽器／手機設定允許位置與精確定位後重試。',
  2:'目前無法取得位置，請移到戶外空曠處。',
  3:'定位逾時，請稍後再試一次。',
  4:'定位服務無法取得位置，請確認裝置與 GPS 狀態。'
};

function geoError(err){
  if(session?.state==='running')pause('定位中斷，已暫停。'+(GEO_REASONS[err.code]||'請重試。'));
  else message(GEO_REASONS[err.code]||'定位失敗。');
  $('badge').textContent='● 定位不可用';
}

function locateError(err){
  message(GEO_REASONS[err.code]||'定位失敗。');
  if(!session||session.state!=='running')$('badge').textContent='● 定位不可用';
}

function available(){
  if(!window.isSecureContext){message('GPS 需要 HTTPS 網址（電腦本機 localhost 例外），請依部署說明開啟。');return false;}
  if(!navigator.geolocation){message('瀏覽器不支援 GPS 定位，請使用支援位置服務的裝置。');return false;}
  return true;
}

$('locate').onclick=()=>{
  if(session?.demo){message('示範模式使用模擬位置；結束後可取得真實定位。');return;}
  if(!available())return;
  message('正在取得你的定位…');
  navigator.geolocation.getCurrentPosition(pos=>{
    const p=normalize(pos); displayPosition(p); setStart(p); message('定位成功。');
  }, locateError, {enableHighAccuracy:true, timeout:15000, maximumAge:0});
};

function normalize(pos){
  const lat = Number(pos?.coords?.latitude ?? pos?.latitude ?? pos?.lat ?? 0);
  const lng = Number(pos?.coords?.longitude ?? pos?.longitude ?? pos?.lng ?? 0);
  const accuracy = Number(pos?.coords?.accuracy ?? pos?.accuracy ?? pos?.hdop ?? 0);
  const altitude = Number(pos?.coords?.altitude ?? pos?.altitude ?? pos?.alt ?? 0);
  const ts = Number(pos?.timestamp ?? pos?.t ?? Date.now());
  return {
    latitude: lat,
    longitude: lng,
    altitude,
    timestamp: ts,
    hdop: accuracy,
    lat,
    lng,
    accuracy,
    t: ts,
    alt: altitude
  };
}
function seconds(){return session?session.seconds+(session.state==='running'&&session.runStart?(Date.now()-session.runStart)/1000:0):0;}
function fmt(n){const s=Math.floor(n);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}

function averageSpeedKmH(meters, secondsValue){
  if(!Number.isFinite(meters) || !Number.isFinite(secondsValue) || secondsValue <= 0) return 0;
  return (meters / 1000) / (secondsValue / 3600);
}

function render(){
  document.body.classList.toggle('is-active',!!session&&session.state!=='finished');
  $('activityLabel').textContent=session?.demo?'示範運動':session?.mode?.split(' · ')[0]||'開始運動';
  const s=seconds();
  const meters=session?.meters||0;
  const kcal=session?.kcal||0;
  $('elapsed').textContent=fmt(s);
  $('distance').textContent=(meters/1000).toFixed(2);
  $('calories').textContent=Math.round(kcal);
  $('speed').textContent=(s>0?averageSpeedKmH(meters,s):0).toFixed(1);
  $('points').textContent=String(session?.points?.length||0);
  const active = !!session && session.state !== 'finished';
  $('fields').disabled = !active;
  $('start').disabled = !session || session.state === 'finished';
  $('pause').disabled = !session || session.state === 'finished';
  $('finish').disabled = !session || session.state === 'finished';
  $('pause').textContent=session?.state === 'paused' ? '繼續' : '暫停';
  if(!session) $('badge').textContent='● 未開始';
  else if(session.state==='running') $('badge').textContent='● 記錄中';
  else if(session.state==='paused') $('badge').textContent='● 已暫停';
  else if(session.state==='finished') $('badge').textContent='● 已完成';
}

async function holdScreen(){try{if('wakeLock'in navigator)wake=await navigator.wakeLock.request('screen');}catch{}} 
function stopWatch(){if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}clearInterval(demoTimer);demoTimer=null;wake?.release().catch(()=>{});wake=null;}

function toSessionPoint(point, segmentIndex = 0) {
  const normalized = normalize(point || {});
  return {
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    altitude: normalized.altitude,
    timestamp: normalized.timestamp,
    hdop: normalized.hdop,
    lat: normalized.lat,
    lng: normalized.lng,
    accuracy: normalized.accuracy,
    t: normalized.t,
    alt: normalized.alt,
    segment: segmentIndex
  };
}

function receive(p){
  if(!session||session.state!=='running')return;
  lastSignal=Date.now();
  const nextPoint = normalize(p);
  displayPosition(nextPoint);
  const result=MoveCore.accept(last,nextPoint);
  if(!result.ok){message(result.reason);return;}
  if(!session.runStart) session.runStart=Date.now();
  if(!lines.length) lines.push([]);
  lines[lines.length-1].push([nextPoint.lat,nextPoint.lng]);
  session.meters = (session.meters||0) + (result.meters||0);
  session.kcal = MoveCore.calories(session.met, session.weight, seconds());
  session.points.push(toSessionPoint(nextPoint, lines.length-1));
  last=nextPoint;
  setTrack(lines.flat());
  if(session.points.length===1&&map){map.setView([nextPoint.lat,nextPoint.lng],18);setStart(nextPoint);}
  $('badge').textContent = session.demo ? '● 示範中' : '● 記錄中';
  render();
}

function run(){
  session.state='running';
  session.runStart=Date.now();
  last=null;
  lastSignal=Date.now();
  if(session.demo){demoTick();demoTimer=setInterval(demoTick,1000);} else { watch=navigator.geolocation.watchPosition(pos=>receive(normalize(pos)), geoError, {enableHighAccuracy:true, timeout:15000, maximumAge:0}); }
  render();
}

function begin(demo){
  const fields=demo?['height','weight','age'].map($):[$('profile')];
  if(!fields.every(el=>el.reportValidity()))return;
  if(!demo&&!available())return;
  $('setupDialog').close();
  stopWatch();
  session={
    id:Date.now(),
    date:new Date().toISOString(),
    alias:$('alias').value.trim(),
    height:Number($('height').value||0),
    weight:Number($('weight').value||0),
    age:Number($('age').value||0),
    met:Number($('mode').value||0),
    mode:$('mode').selectedOptions[0]?.textContent || '舒適步行',
    demo:!!demo,
    seconds:0,
    meters:0,
    kcal:0,
    points:[],
    runStart:0,
    state:'ready'
  };
  lines=[];
  setTrack([]);
  clearStart();
  message(demo ? '示範模式已開始。' : '開始運動，請保持定位開啟。');
  run();
}

$('profile').onsubmit=e=>{e.preventDefault();begin(false);};
$('demo').onclick=()=>begin(true);

function demoTick(){
  const i=session.demoIndex++, angle=i*.12;
  session.seconds+=5;
  const gps = {
    latitude: center[0] + .00062 * Math.sin(angle),
    longitude: center[1] + .00085 * Math.cos(angle),
    accuracy: 6,
    timestamp: session.id + i * 6000,
    altitude: 0,
    hdop: 6
  };
  receive(gps);
}

function pause(reason){
  if(!session||session.state!=='running')return;
  session.seconds=seconds();
  session.runStart=0;
  session.state='paused';
  stopWatch();
  last=null;
  $('badge').textContent='● 已暫停';
  if(reason) message(reason);
  render();
}

$('pause').onclick=()=>{
  if(session.state==='running') pause();
  else { message('等待新的有效定位後繼續…'); run(); }
};

function persist(){
  try{localStorage.setItem(KEY,JSON.stringify(records));storageOK=true;}catch{storageOK=false;message('裝置儲存空間不足或儲存被封鎖。紀錄暫留本頁，請先匯出。');}
}

$('finish').onclick=()=>{
  if(!session||session.state==='finished')return;
  session.seconds=seconds();
  session.runStart=0;
  session.state='finished';
  stopWatch();
  session.kcal=MoveCore.calories(session.met, session.weight, session.seconds);
  session.avgSpeed = averageSpeedKmH(session.meters || 0, session.seconds || 0);
  const record={
    id:session.id,
    date:session.date,
    alias:session.alias,
    demo:!!session.demo,
    mode:session.mode,
    height:session.height,
    weight:session.weight,
    age:session.age,
    met:session.met,
    meters: Number(session.meters || 0),
    seconds: Number(session.seconds || 0),
    kcal:Number(session.kcal || 0),
    avgSpeed:Number(session.avgSpeed || 0),
    points:[...(session.points||[])],
    target: target ? {lat:target.lat,lng:target.lng} : null
  };
  const enriched = window.TrackMetricsCalculator ? window.TrackMetricsCalculator.fromRecord(record) : record;
  records.unshift(enriched);
  persist();
  renderHistory();
  render();
  message('運動紀錄已完成，平均速度 ' + (enriched.avgSpeedKmH || enriched.avgSpeed || 0).toFixed(1) + ' km/h。');
};

function download(name,body,type){
  const url=URL.createObjectURL(new Blob([body],{type}));
  const a=document.createElement('a');
  a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function cell(v){
  let s=String(v ?? '');
  if(/^[=+\-@\t\r]/.test(s)) s="'" + s;
  return '"' + s.replaceAll('"','""') + '"';
}

function exportRows(items){
  const rows=[['時間 ISO','課堂代號','類型','活動','身高 cm','體重 kg','年齡','時間 sec','距離 m','平均速度 km/h','總熱量 kcal','有效定位點','集合點']];
  for(const r of items){
    const metrics = window.TrackMetricsCalculator ? window.TrackMetricsCalculator.fromRecord(r) : r;
    const avg = Number(metrics.avgSpeedKmH ?? (r.seconds>0 ? averageSpeedKmH(r.meters || 0, r.seconds) : 0));
    const targetText = r.target ? `${r.target.lat.toFixed(5)}, ${r.target.lng.toFixed(5)}` : '';
    rows.push([
      r.date || new Date().toISOString(),
      r.alias || '',
      r.demo ? '示範' : 'GPS',
      r.mode || '',
      r.height ?? '',
      r.weight ?? '',
      r.age ?? '',
      Number(r.seconds || 0),
      Number(metrics.meters || 0),
      avg.toFixed(1),
      Number(metrics.estKJ || r.kcal || 0),
      Array.isArray(r.points) ? r.points.length : 0,
      targetText
    ]);
  }
  return rows;
}

function exportCSV(items){
  if(!items.length){message('目前沒有可匯出的紀錄。');return;}
  const rows=exportRows(items);
  const csv = rows.map(row => row.map(cell).join(',')).join('\r\n');
  download('pace-運動紀錄.xls', csv, 'application/vnd.ms-excel;charset=utf-8;');
  message('已匯出 Excel 格式運動紀錄。');
}

let historyFilter='all';
function routeThumbnail(r){
  const box=document.createElement('div');
  box.className='route-thumb';
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 100 67');
  svg.setAttribute('aria-label','路線預覽');
  const ps=(r.points||[]);
  if(ps.length>1){
    const xs=ps.map(p=>p.lng ?? p.longitude ?? 0), ys=ps.map(p=>p.lat ?? p.latitude ?? 0), minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const scale=Math.min(76/(Math.max(maxX-minX,0.0001)),43/(Math.max(maxY-minY,0.0001)));
    const group=new Map();
    for(const p of ps){
      const k=p.segment||0;
      if(!group.has(k))group.set(k,[]);
      group.get(k).push(`${50 + (p.lng ?? p.longitude ?? 0 - minX) * scale * 2},${33.5 - (p.lat ?? p.latitude ?? 0 - minY) * scale * 2}`);
    }
    for(const points of group.values()){
      const poly=document.createElementNS(ns,'polyline');
      poly.setAttribute('points',points.join(' '));
      poly.setAttribute('fill','none');
      poly.setAttribute('stroke','#d95432');
      poly.setAttribute('stroke-width','2.2');
      poly.setAttribute('stroke-linecap','round');
      poly.setAttribute('stroke-linejoin','round');
      svg.append(poly);
    }
  } else {
    const t=document.createElementNS(ns,'text');
    t.setAttribute('x','50');
    t.setAttribute('y','38');
    t.setAttribute('text-anchor','middle');
    t.setAttribute('font-size','9');
    t.setAttribute('fill','#9aa9a7');
    t.textContent='無路線';
    svg.append(t);
  }
  box.append(svg);
  return box;
}

function renderHistory(){
  const root=$('records');
  root.replaceChildren();
  const actual=records.filter(r=>!r.demo);
  $('historyTotal').textContent=actual.length?`${actual.length} 次運動 · ${actual.reduce((s,r)=>s+(Number(r.meters)||0),0)/1000} km`: '0 次運動';
  const shown = records.filter(r => historyFilter==='all' ? true : historyFilter==='demo' ? !!r.demo : !r.demo);
  if(!shown.length){
    root.innerHTML='<div class="empty-state"><div class="empty-art"><svg><use href="#i-route"/></svg></div><div><h3>還沒有紀錄</h3><p>完成一次運動後，就可以在這裡查看與匯出紀錄。</p></div></div>';
    return;
  }
  for(const r of shown){
    const row=document.createElement('div');
    row.className='record';
    row.append(routeThumbnail(r));
    const info=document.createElement('div');
    info.className='record-info';
    const title=document.createElement('strong');
    title.textContent = r.alias || (r.demo ? '示範運動' : '運動紀錄');
    const meta=document.createElement('small');
    const metrics = window.TrackMetricsCalculator ? window.TrackMetricsCalculator.fromRecord(r) : r;
    meta.textContent = `${new Date(r.date||Date.now()).toLocaleString('zh-TW')} · ${(Number(metrics.meters)||0)/1000} km · 平均 ${(Number(metrics.avgSpeedKmH ?? (r.seconds>0 ? averageSpeedKmH(r.meters || 0, r.seconds) : 0)) || 0).toFixed(1)} km/h`;
    info.append(title, meta);
    row.append(info);
    root.append(row);
  }
}

$('openSetup').onclick=()=>$('setupDialog').showModal();
$('closeSetup').onclick=()=>$('setupDialog').close();
$('energyInfo').onclick=()=>$('energyDialog').showModal();
$('closeEnergy').onclick=()=>$('energyDialog').close();
$('todayDate').textContent=new Date().toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'short'});

document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{historyFilter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('selected',b===button);});renderHistory();});
$('exportAll').onclick=()=>exportCSV(records); 
$('deleteAll').onclick=()=>{if(records.length&&confirm('永久刪除此裝置全部運動紀錄？')){records=[];persist();renderHistory();}};

document.addEventListener('visibilitychange',()=>{if(document.hidden&&session?.state==='running')pause('頁面已離開前景，為避免漏記與錯估已自動暫停。回到頁面後按「繼續」。');});
window.addEventListener('beforeunload',e=>{if(session&&session.state!=='finished'){e.preventDefault();e.returnValue='';}});

setInterval(()=>{
  if(session?.state==='running'&&!session.demo&&Date.now()-lastSignal>30000)pause('超過 30 秒沒有 GPS 更新，已自動暫停。請檢查定位後按繼續。');
  render();
},1000);

renderHistory();
render();
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});

document.querySelectorAll('.sidenav a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.sidenav a').forEach(n=>n.classList.toggle('active',n===a));document.querySelectorAll('section[id]').forEach(sec=>sec.hidden = sec.id !== a.getAttribute('href').slice(1));}));

