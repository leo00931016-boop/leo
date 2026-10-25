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
try{map=L.map('map',{zoomControl:false}).setView(center,17);L.control.zoom({position:'bottomright'}).addTo(map);addBaseMap(map).on('tileerror',()=>message('底圖載入失敗，請檢查網路；Google / OpenStreetMap 圖源可能暫時不可用。'));}catch{}
function updateTarget(){if(!target){$('navigate').hidden=true;$('targetInfo').textContent='點一下地圖，設定老師指定的集合點。';return;}let info='集合點已設定（依老師現場指定）';if(target&&target.label)info+='：'+target.label;$('targetInfo').textContent=info;$('navigate').hidden=false;}
function clearTarget(){target=null;for(const l of [targetMarker,targetLine])if(l&&map)map.removeLayer(l);targetMarker=targetLine=null;updateTarget();}
$('clearTarget').onclick=clearTarget;$('campus').onclick=()=>map&&map.setView(center,17);
function displayPosition(p){current=p;if(map){const ll=[p.lat,p.lng];if(!positionDot){positionDot=L.circleMarker(ll,{radius:7,color:'white',weight:3,fillColor:'#2f88b3',fillOpacity:1}).addTo(map);positionDot.bindTooltip('目前位置');}else positionDot.setLatLng(ll);if(p.accuracy>0){if(!accuracyCircle){accuracyCircle=L.circle(ll,p.accuracy,{color:'#2f88b3',fillColor:'#2f88b3',fillOpacity:0.12}).addTo(map);}else accuracyCircle.setLatLng(ll).setRadius(p.accuracy);}}}
const GEO_REASONS={1:'定位權限被拒絕：請到瀏覽器／手機設定允許位置與精確定位後重試。',2:'目前無法取得位置，請移到戶外空曠處。',3:'定位逾時，請再試一次。',4:'定位服務不可用。'};
function geoError(err){if(session?.state==='running')pause('定位中斷，已暫停。'+(GEO_REASONS[err.code]||'請重試。'));else message(GEO_REASONS[err.code]||'定位失敗。');$('badge').textContent='● 定位不可用';}
function locateError(err){message(GEO_REASONS[err.code]||'定位失敗。');if(!session||session.state!=='running')$('badge').textContent='● 定位不可用';}
function available(){if(!window.isSecureContext){message('GPS 需要 HTTPS 網址（電腦本機 localhost 例外），請依部署說明開啟。');return false;}if(!navigator.geolocation){message('此瀏覽器不支援 GPS 定位。');return false;}return true;}
$('locate').onclick=()=>{if(session?.demo){message('示範模式使用模擬位置；結束後可取得真實定位。');return;}if(!available())return;message('正在取得你的定位…');navigator.geolocation.getCurrentPosition(pos=>{displayPosition(normalize(pos));message('已取得定位。');},locateError,{enableHighAccuracy:true,timeout:15000,maximumAge:1000});};
function normalize(pos){return {lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy,t:pos.timestamp};}
function seconds(){return session?session.seconds+(session.state==='running'&&session.runStart?(Date.now()-session.runStart)/1000:0):0;}
function fmt(n){const s=Math.floor(n);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function render(){document.body.classList.toggle('is-active',!!session&&session.state!=='finished');$('activityLabel').textContent=session?.demo?'示範運動':session?.mode?.split(' · ')[0]||'未選擇';const total=seconds();$('clock').textContent=fmt(total);const km=(session?.meters||0)/1000;$('distanceReadout').textContent=km.toFixed(2);const speed=total>0?km/(total/3600):0;$('speedReadout').textContent=speed.toFixed(1);$('kcalReadout').textContent=String(Math.round(session?.kcal||0));}
async function holdScreen(){try{if('wakeLock'in navigator)wake=await navigator.wakeLock.request('screen');}catch{}}
function stopWatch(){if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}clearInterval(demoTimer);demoTimer=null;wake?.release().catch(()=>{});wake=null;}
function receive(p){if(!session||session.state!=='running')return;lastSignal=Date.now();displayPosition(p);const result=MoveCore.accept(last,p);if(!result.ok){message(result.reason);return;}if(!session.points)session.points=[];session.points.push({lat:p.lat,lng:p.lng,t:p.t,accuracy:p.accuracy,segment:session.segment||0});if(!last){last=p;setStart(p);return;}const distance=MoveCore.distance(last,p);if(distance>0){session.meters=(session.meters||0)+distance;const dt=(p.t-last.t)/1000;if(dt>0){const speed=distance/dt;session.speed=Math.max(session.speed||0,speed);}}last=p;setTrack(session.points.map(pt=>[pt.lat,pt.lng]));}
function run(){session.state='running';session.runStart=Date.now();last=null;lastSignal=Date.now();if(session.demo){demoTick();demoTimer=setInterval(demoTick,1000);}else{watch=navigator.geolocation.watchPosition(pos=>receive(normalize(pos)),geoError,{enableHighAccuracy:true,timeout:10000,maximumAge:1000});}}
function begin(demo){const fields=demo?['height','weight','age'].map($):[$('profile')];if(!fields.every(el=>el.reportValidity()))return;if(!demo&&!available())return;$('setupDialog').close();stopWatch();session={demo,mode:document.querySelector('input[name="mode"]')?.value||'舒適步行',points:[],meters:0,seconds:0,kcal:0,met:MoveCore.metByMode('舒適步行'),state:'ready',id:Date.now()};session.segment=0;session.averageSpeed=0;render();message('運動已開始');run();}
$('profile').onsubmit=e=>{e.preventDefault();begin(false);};$('demo').onclick=()=>begin(true);
function demoTick(){const i=session.demoIndex++,angle=i*.12;session.seconds+=5;receive({lat:center[0]+.00062*Math.sin(angle),lng:center[1]+.00085*Math.cos(angle),accuracy:6,t:Date.now()});}
function pause(reason){if(!session||session.state!=='running')return;session.seconds=seconds();session.runStart=0;session.state='paused';stopWatch();last=null;$('badge').textContent='● 已暫停';if(reason)message(reason);}
$('pause').onclick=()=>{if(session.state==='running')pause();else {message('等待新的有效定位後繼續…');run();}};
function persist(){try{localStorage.setItem(KEY,JSON.stringify(records));storageOK=true;}catch{storageOK=false;message('裝置儲存空間不足或儲存被封鎖。紀錄暫留本頁，請先匯出或清理儲存空間。');}}
$('finish').onclick=()=>{if(!session||session.state==='finished')return;session.seconds=seconds();session.runStart=0;session.state='finished';stopWatch();session.kcal=MoveCore.calories(session.met||3.5, Number($('weight')?.value||session.weight||60), session.seconds);const clean={...session,points:session.points||[],seconds:session.seconds,meters:session.meters||0,kcal:session.kcal||0,date:new Date().toISOString()};records.push(clean);persist();renderHistory();render();message('已完成本次運動，已儲存紀錄。');};
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function cell(v){let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function buildExportRow(record) {
  const points = Array.isArray(record?.points) ? record.points : [];
  const seconds = safeNumber(record?.seconds, 0);
  const meters = safeNumber(record?.meters, 0);
  const avgSpeedKmH = seconds > 0 ? (meters / 1000) / (seconds / 3600) : 0;
  const hasKcal = safeNumber(record?.kcal, 0) > 0;
  const estKcal = hasKcal ? safeNumber(record.kcal, 0) : (safeNumber(record?.estKJ, safeNumber(record?.energyKJ, 0)) / 4.184);
  const segmentCount = Array.isArray(points) && points.length ? new Set(points.map(p => p.segment || 0)).size : 0;
  const straightLineDistance = Array.isArray(points) && points.length > 1 ? MoveCore.distance(points[0], points[points.length - 1]) : 0;
  const fastestAdjacentSpeedKmH = safeNumber(record?.fastestAdjacentSpeedKmH, 0);
  const validGpsPoints = points.length;
  return [
    record?.date ? new Date(record.date).toISOString() : '',
    record?.alias || '',
    record?.type || '',
    record?.mode || '',
    safeNumber(record?.height, 0),
    safeNumber(record?.weight, 0),
    safeNumber(record?.age, 0),
    seconds,
    meters,
    avgSpeedKmH,
    estKcal,
    segmentCount,
    straightLineDistance,
    fastestAdjacentSpeedKmH,
    validGpsPoints
  ];
}
function exportCSV(items){if(!items.length){message('目前沒有可匯出的紀錄。');return;}const rows=[['時間 ISO','課堂代號','類型','活動','身高 cm','體重 kg','年齡','時間 sec','距離 m','平均速度 km/h','估算熱量 kcal','段數','起點到終點直線距離 m','最快相鄰點速度 km/h','有效 GPS 點'],...items.map(buildExportRow)];const csv=rows.map(r=>r.map(cell).join(',')).join('\n');download('campus-move-export.csv',csv,'text/csv;charset=utf-8');message('已匯出 CSV：campus-move-export.csv');}
function exportExcel(items){if(!items.length){message('目前沒有可匯出的紀錄。');return;}const rows=[['時間 ISO','課堂代號','類型','活動','身高 cm','體重 kg','年齡','時間 sec','距離 m','平均速度 km/h','估算熱量 kcal','段數','起點到終點直線距離 m','最快相鄰點速度 km/h','有效 GPS 點'],...items.map(buildExportRow)];if(typeof XLSX !== 'undefined' && XLSX.utils && XLSX.writeFile){const ws=XLSX.utils.aoa_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'運動紀錄');XLSX.writeFile(wb,'campus-move-export.xlsx');message('已匯出 Excel：campus-move-export.xlsx');return;}exportCSV(items);}
let historyFilter='all';
function routeThumbnail(r){const box=document.createElement('div');box.className='route-thumb';const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 100 56');svg.setAttribute('preserveAspectRatio','none');const poly=document.createElementNS(ns,'polyline');const pts=(r.points||[]).slice(0, 200);if(pts.length){const xs=pts.map(p=>p.lat),ys=pts.map(p=>p.lng);const minLat=Math.min(...xs),maxLat=Math.max(...xs),minLng=Math.min(...ys),maxLng=Math.max(...ys);const coords=pts.map(p=>{const x=((p.lat-minLat)/(maxLat-minLat||1))*100;const y=((p.lng-minLng)/(maxLng-minLng||1))*56;return `${x},${y}`;}).join(' ');poly.setAttribute('points',coords);poly.setAttribute('fill','none');poly.setAttribute('stroke','#d95432');poly.setAttribute('stroke-width','3');poly.setAttribute('stroke-linecap','round');svg.appendChild(poly);}box.appendChild(svg);return box;}
function renderHistory(){const root=$('records');root.replaceChildren();const actual=records.filter(r=>!r.demo);$('historyTotal').textContent=actual.length?`${actual.length} 次運動 · ${(actual.reduce((sum,r)=>sum+(r.meters||0),0)/1000).toFixed(2)} km`: '0 次運動';for(const r of actual){const card=document.createElement('article');card.className='record-card';const meta=document.createElement('div');meta.className='record-meta';meta.innerHTML=`<span>${new Date(r.date||Date.now()).toLocaleDateString('zh-TW')}</span><span>${r.mode||'運動'}</span><span>${Math.round((r.meters||0))} m</span>`;card.appendChild(meta);card.appendChild(routeThumbnail(r));const footer=document.createElement('div');footer.className='record-footer';footer.innerHTML=`<strong>${((r.meters||0)/1000).toFixed(2)} km</strong><span>${fmt(r.seconds||0)}</span><span>${Math.round(r.kcal||0)} kcal</span>`;card.appendChild(footer);root.appendChild(card);}}
$('openSetup').onclick=()=>$('setupDialog').showModal();$('closeSetup').onclick=()=>$('setupDialog').close();$('energyInfo').onclick=()=>$('energyDialog').showModal();$('closeEnergy').onclick=()=>$('energyDialog').close();
$('todayDate').textContent=new Date().toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'short'});
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{historyFilter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('select',b===button);});renderHistory();});
$('exportAll').onclick=()=>exportExcel(records);$('deleteAll').onclick=()=>{if(records.length&&confirm('永久刪除此裝置全部運動紀錄？')){records=[];persist();renderHistory();}};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&session?.state==='running')pause('頁面已離開前景，為避免漏記與錯估已自動暫停。回到頁面後按「繼續」即可。');render();});
window.addEventListener('beforeunload',e=>{if(session&&session.state!=='finished'){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(session?.state==='running'&&!session.demo&&Date.now()-lastSignal>30000)pause('超過 30 秒沒有 GPS 更新，已自動暫停。請檢查定位後按繼續。');render();},1000);
renderHistory();render();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
document.querySelectorAll('.sidenav a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.sidenav a').forEach(n=>n.classList.toggle('active',n===a));document.querySelectorAll('.sidenav a').forEach(n=>n.classList.remove('active'));a.classList.add('active');}));






























































































































































































































































































































































































































































































































n
