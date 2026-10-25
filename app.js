'use strict';

const $=id=>document.getElementById(id), center=[24.1796,120.6495], KEY='campus-move-history-v1';

let records=[];try{records=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(records))records=[];}catch{}

let map, route, halo=null, startMarker=null, positionDot, accuracyCircle, targetMarker, targetLine, target=null, current=null;
let session=null, watch=null, demoTimer=null, wake=null, last=null, lastSignal=0, lines=[], storageOK=true;

function message(s){$('message').textContent=s;}

function pinIcon(kind,label){
  return L.divIcon({
    className:'map-pin-wrap map-pin-'+kind,
    html:'<span class="pin-body"><b>'+label+'</b></span>',
    iconSize:[30,30],
    iconAnchor:[15,30]
  });
}

function setTrack(lines){
  if(route) route.setLatLngs(lines);
  if(halo) halo.setLatLngs(lines);
}

function clearStart(){
  if(startMarker&&map) map.removeLayer(startMarker);
  startMarker=null;
}

function setStart(p){
  clearStart();
  if(map){
    startMarker=L.marker([p.lat,p.lng],{
      icon:pinIcon('start','起'),
      zIndexOffset:500
    }).addTo(map).bindTooltip('起點');
  }
}

try{
  map=L.map('map',{zoomControl:false}).setView(center,17);
  L.control.zoom({position:'bottomright'}).addTo(map);
  addBaseMap(map).on('tileerror',()=>message('底圖載入失敗，請檢查網路；GPS 仍可嘗試定位。'));
  halo=L.polyline([], {color:'#ffeb3b', weight:9, opacity:.35, lineCap:'round', lineJoin:'round'}).addTo(map);
  route=L.polyline([], {color:'#d95432', weight:5, lineCap:'round', lineJoin:'round'}).addTo(map);
  map.on('click',e=>{
    target={lat:e.latlng.lat,lng:e.latlng.lng};
    updateTarget();
  });
}catch{}

function updateTarget(){
  if(!target){
    $('navigate').hidden=true;
    $('targetInfo').textContent='點一下地圖，設定老師指定的集合點。';
    return;
  }
  let info='集合點已設定（依老師現場位置）';
  if(current){
    const d=Math.round(MoveCore.distance(current,{lat:target.lat,lng:target.lng}));
    info=`距離：${d} m`;
  }
  $('targetInfo').textContent=info;
  $('navigate').hidden=false;
  $('navigate').href=`https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=walking`;
  if(targetMarker) map.removeLayer(targetMarker);
  if(targetLine) map.removeLayer(targetLine);

  targetMarker=L.marker([target.lat,target.lng],{icon:pinIcon('target','終'),zIndexOffset:600}).addTo(map).bindTooltip('集合點');
  if(current){
    targetLine=L.polyline([[current.lat,current.lng],[target.lat,target.lng]],{color:'#aef0ff',dashArray:'6 8',weight:2}).addTo(map);
  }
}

function clearTarget(){
  target=null;
  for(const l of [targetMarker,targetLine]) if(l&&map) map.removeLayer(l);
  targetMarker=targetLine=null;
  updateTarget();
}

$('clearTarget').onclick=clearTarget;
$('campus').onclick=()=>map&&map.setView(center,17);

function displayPosition(p){
  current=p;
  if(map){
    const ll=[p.lat,p.lng];
    if(!positionDot){
      positionDot=L.circleMarker(ll,{radius:7,color:'white',weight:3,fillColor:'#2f88b3',fillOpacity:1}).addTo(map);
      accuracyCircle=L.circle(ll,{radius:p.accuracy,color:'#2f88b3',weight:1,fillOpacity:.08}).addTo(map);
    }else{
      positionDot.setLatLng(ll);
      accuracyCircle.setLatLng(ll).setRadius(p.accuracy);
    }
  }
  $('accuracy').textContent=`±${Math.round(p.accuracy)} m`;
  updateTarget();
}

const GEO_REASONS={
  1:'定位權限被拒絕：請到瀏覽器／手機設定允許位置與精確定位後重試。',
  2:'目前無法取得位置，請移到戶外空曠處。',
  3:'定位逾時，請再試一次。',
  4:'定位失敗，請檢查裝置與網路。'
};

function geoError(err){
  if(session?.state==='running') pause('定位中斷，已暫停。'+(GEO_REASONS[err.code]||'請重試。'));
  else message(GEO_REASONS[err.code]||'定位失敗。');
  $('badge').textContent='● 定位不可用';
}

function locateError(err){
  message(GEO_REASONS[err.code]||'定位失敗。');
  if(!session||session.state!=='running') $('badge').textContent='● 定位不可用';
}

function available(){
  if(!window.isSecureContext){
    message('GPS 需要 HTTPS 網址（電腦本機 localhost 例外），請依部署說明開啟。');
    return false;
  }
  if(!navigator.geolocation){
    message('這個裝置不支援定位功能。');
    return false;
  }
  return true;
}

$('locate').onclick=()=>{
  if(session?.demo){
    message('示範模式使用模擬位置；結束後可取得真實定位。');
    return;
  }
  if(!available()) return;
  message('正在取得你的定位…');
  navigator.geolocation.getCurrentPosition(pos=>{
    const p=normalize(pos);
    displayPosition(p);
    if(session&&session.state==='running'){
      receive(p);
    } else {
      setStart(p);
      if(map) map.setView([p.lat,p.lng],18);
    }
  }, locateError, {enableHighAccuracy:true,timeout:15000,maximumAge:0});
};

function normalize(pos){
  return {
    lat:pos.coords.latitude,
    lng:pos.coords.longitude,
    accuracy:pos.coords.accuracy,
    t:pos.timestamp
  };
}

function seconds(){
  return session ? session.seconds + (session.state==='running'&&session.runStart ? (Date.now()-session.runStart)/1000 : 0) : 0;
}

function fmt(n){
  const s=Math.floor(n);
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

function render(){
  document.body.classList.toggle('is-active',!!session&&session.state!=='finished');
  $('activityLabel').textContent=session?.demo?'示範運動':session?.mode?.split(' · ')[0]||'校園運動';
  const s=seconds(), d=session?.meters||0;
  $('elapsed').textContent=fmt(s);
  $('distance').textContent=(d/1000).toFixed(2);
  $('calories').textContent=session?Math.round(MoveCore.calories(session.met, session.weight, s)):0;
  $('speed').textContent=s>0 ? ((d/s)*3.6).toFixed(1) : '0.0';
  $('points').textContent=session ? (session.points?.length||0) : 0;
  $('fields').disabled=!session || session.state==='finished';
  $('start').disabled=!session || session.state==='finished';
  $('demo').disabled=!session || session.state==='finished';
  $('pause').disabled=!session || session.state==='finished';
  $('finish').disabled=!session || session.state==='finished';
  $('pause').textContent=session?.state==='paused' ? '繼續' : '暫停';
}

async function holdScreen(){
  try{
    if('wakeLock' in navigator) wake=await navigator.wakeLock.request('screen');
  }catch{}
}

function stopWatch(){
  if(watch!==null){
    navigator.geolocation.clearWatch(watch);
    watch=null;
  }
  clearInterval(demoTimer);
  demoTimer=null;
  wake?.release().catch(()=>{});
  wake=null;
}

function receive(p){
  if(!session||session.state!=='running') return;
  lastSignal=Date.now();
  displayPosition(p);

  const result=MoveCore.accept(last,p);
  if(!result.ok){
    message(result.reason);
    return;
  }

  if(!session.runStart) session.runStart=Date.now();

  if(last){
    const d=MoveCore.distance(last,p);
    session.meters=(session.meters||0)+d;
    session.segmentCount=(session.segmentCount||0)+1;

    const dt=(p.t-last.t)/1000;
    if(dt>0){
      const speed=d/dt;
      session.fastestAdjacentSpeed=Math.max(session.fastestAdjacentSpeed||0,speed);
    }
  }else{
    session.start={lat:p.lat,lng:p.lng};
  }

  session.points=session.points||[];
  session.points.push({lat:p.lat,lng:p.lng,t:p.t,accuracy:p.accuracy});
  last=p;

  if(session.points.length>1){
    const start=session.points[0];
    const end=session.points[session.points.length-1];
    session.straightLineDistance=MoveCore.straightLineDistance(start,end);
  }

  if(session.seconds>0){
    session.avgSpeed=(session.meters||0)/session.seconds;
  }

  if(session.met && session.weight){
    session.kcal=MoveCore.calories(session.met, session.weight, session.seconds);
  }

  setTrack(session.points.map(p=>[p.lat,p.lng]));
  render();
}

function run(){
  session.state='running';
  session.runStart=0;
  last=null;
  lastSignal=Date.now();

  if(session.demo){
    demoTick();
    demoTimer=setInterval(demoTick,1000);
  }else{
    watch=navigator.geolocation.watchPosition(pos=>{
      const p=normalize(pos);
      receive(p);
    }, geoError, {
      enableHighAccuracy:true,
      maximumAge:0,
      timeout:15000
    });
    holdScreen();
  }
  render();
}

function begin(demo){
  const fields=demo ? ['height','weight','age'].map($) : [$('profile')];
  if(!fields.every(el=>el.reportValidity())) return;
  if(!demo && !available()) return;

  $('setupDialog').close();
  stopWatch();

  session={
    id:Date.now(),
    date:new Date().toISOString(),
    alias:$('alias').value.trim(),
    height:Number($('height').value),
    weight:Number($('weight').value),
    age:Number($('age').value),
    met:Number($('mode').value),
    mode:$('mode').selectedOptions[0].textContent,
    demo:!!demo,
    seconds:0,
    meters:0,
    points:[],
    runStart:0,
    state:'running',
    demoIndex:0,
    kcal:0,
    avgSpeed:0,
    straightLineDistance:0,
    fastestAdjacentSpeed:0,
    segmentCount:0
  };

  lines=[];
  setTrack([]);
  clearStart();

  message(demo ? '示範模式已啟動，正在產生模擬 GPS。' : 'GPS 定位已啟動，請開始運動。');
  $('badge').textContent = demo ? '● 示範模式' : '● GPS 定位中';
  run();
}

$('profile').onsubmit=e=>{
  e.preventDefault();
  begin(false);
};

$('demo').onclick=()=>begin(true);

function demoTick(){
  const i=session.demoIndex++, angle=i*.12;
  session.seconds+=5;
  receive({
    lat:center[0]+.00062*Math.sin(angle),
    lng:center[1]+.00085*Math.cos(angle),
    accuracy:6,
    t:session.id+i*6000
  });
}

function pause(reason){
  if(!session||session.state!=='running') return;
  session.seconds=seconds();
  session.runStart=0;
  session.state='paused';
  stopWatch();
  last=null;

  $('badge').textContent='● 已暫停';
  message(reason || '已暫停，請確認 GPS 後繼續。');
  render();
}

$('pause').onclick=()=>{
  if(session.state==='running') pause();
  else{
    message('等待新的有效定位後繼續…');
    run();
  }
};

function persist(){
  try{
    localStorage.setItem(KEY,JSON.stringify(records));
    storageOK=true;
  }catch{
    storageOK=false;
    message('裝置儲存空間不足或儲存被封鎖。紀錄暫留本頁，請先匯出。');
  }
}

$('finish').onclick=()=>{
  if(!session||session.state==='finished') return;

  session.seconds=seconds();
  session.runStart=0;
  session.state='finished';
  stopWatch();

  if(session.points && session.points.length>0){
    const start=session.points[0];
    const end=session.points[session.points.length-1];
    session.straightLineDistance=MoveCore.straightLineDistance(start,end);
    session.fastestAdjacentSpeed=MoveCore.fastestAdjacentSpeed(session.points);
    session.segmentCount=MoveCore.segmentCount(session.points);
  }

  if(session.seconds>0){
    session.avgSpeed=(session.meters||0)/session.seconds;
  }

  session.kcal=MoveCore.calories(session.met, session.weight, session.seconds);

  const record={
    ...session,
    date:new Date().toISOString(),
    meters:session.meters||0,
    seconds:session.seconds||0,
    kcal:session.kcal||0,
    avgSpeed:session.avgSpeed||0,
    straightLineDistance:session.straightLineDistance||0,
    segmentCount:session.segmentCount||0,
    fastestAdjacentSpeed:session.fastestAdjacentSpeed||0,
    points:session.points||[]
  };

  records.unshift(record);
  persist();
  renderHistory();
  render();

  $('badge').textContent='● 完成';
  message('本次運動已保存。');
};

function download(name,body,type){
  const url=URL.createObjectURL(new Blob([body],{type}));
  const a=document.createElement('a');
  a.href=url;
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function cell(v){
  let s=String(v ?? '');
  if(/^[=+\-@\t\r]/.test(s)) s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}

function exportCSV(items){
  if(!items.length){
    message('目前沒有可匯出的紀錄。');
    return;
  }

  const rows=[[
    '時間 ISO',
    '課堂代號',
    '類型',
    '活動',
    '身高 cm',
    '體重 kg',
    '年齡',
    '時間 sec',
    '距離 m',
    '平均速度 km/h',
    '熱量 kJ',
    '段數',
    '起點到終點直線距離 m',
    '最快相鄰點速度 km/h',
    '有效 GPS 點'
  ]];

  for(const r of items){
    rows.push([
      r.date || '',
      r.alias || '',
      r.type || '',
      r.mode || '',
      r.height || '',
      r.weight || '',
      r.age || '',
      Math.round(r.seconds || 0),
      (r.meters || 0).toFixed(1),
      ((r.avgSpeed || 0) * 3.6).toFixed(2),
      (r.kcal || 0).toFixed(1),
      r.segmentCount || 0,
      (r.straightLineDistance || 0).toFixed(1),
      ((r.fastestAdjacentSpeed || 0) * 3.6).toFixed(2),
      (r.points ? r.points.length : 0)
    ]);
  }

  const csv=rows.map(row=>row.map(cell).join(',')).join('\n');
  download('campus-move.csv',csv,'text/csv;charset=utf-8');
  message('已匯出 CSV。');
}

let historyFilter='all';

function routeThumbnail(r){
  const box=document.createElement('div');
  box.className='route-thumb';
  const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 100 67');
  svg.setAttribute('aria-label','運動路線');
  const points=r.points||[];
  if(points.length>1){
    const xs=points.map(p=>p.lng), ys=points.map(p=>p.lat);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const scale=Math.min(76/(Math.max(maxX-minX,0.000001)), 43/(Math.max(maxY-minY,0.000001)));
    const groups=new Map();
    for(const p of points){
      const k=p.segment ?? 0;
      if(!groups.has(k)) groups.set(k,[]);
      groups.get(k).push(`${50+(p.lng-minX)*scale},${33+(maxY-p.lat)*scale}`);
    }
    for(const poly of groups.values()){
      const polyline=document.createElementNS(ns,'polyline');
      polyline.setAttribute('points',poly.join(' '));
      polyline.setAttribute('fill','none');
      polyline.setAttribute('stroke','#d95432');
      polyline.setAttribute('stroke-width','2');
      svg.appendChild(polyline);
    }
  }else{
    const text=document.createElementNS(ns,'text');
    text.setAttribute('x','50');
    text.setAttribute('y','38');
    text.setAttribute('text-anchor','middle');
    text.setAttribute('font-size','9');
    text.setAttribute('fill','#9aa98f');
    text.textContent='No route';
    svg.appendChild(text);
  }
  box.appendChild(svg);
  return box;
}

function renderHistory(){
  const root=$('records');
  root.replaceChildren();
  const actual=records.filter(r=>!r.demo);

  $('historyTotal').textContent=actual.length ? `${actual.length} 次運動 · ${(actual.reduce((s,r)=>s+r.meters,0)/1000).toFixed(2)} km` : '0 次運動';

  const shown=records.filter(r=>{
    if(historyFilter==='all') return true;
    if(historyFilter==='demo') return !!r.demo;
    if(historyFilter==='real') return !r.demo;
    return true;
  });

  if(!shown.length){
    root.innerHTML='<div class="empty"><div class="empty-art"><svg><use href="#i-route"/></svg></div><div><h3>還沒有紀錄</h3><p>開始運動後，紀錄會出現在這裡。</p></div></div>';
    return;
  }

  for(const r of shown){
    const row=document.createElement('div');
    row.className='record';

    const thumb=routeThumbnail(r);
    const info=document.createElement('div');
    info.className='record-info';

    const title=document.createElement('strong');
    title.textContent=r.demo ? '示範運動' : (r.alias || r.mode || '校園運動');

    const sub=document.createElement('small');
    sub.textContent=new Date(r.date||Date.now()).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});

    const stats=document.createElement('div');
    stats.className='record-stats';

    const pairs=[
      [`距離`, `${(r.meters/1000).toFixed(2)} km`],
      [`時間`, `${Math.round(r.seconds||0)} sec`],
      [`速度`, `${((r.avgSpeed||0)*3.6).toFixed(1)} km/h`],
      [`熱量`, `${(r.kcal||0).toFixed(1)} kJ`],
      [`段數`, `${r.segmentCount||0}`],
      [`直線`, `${(r.straightLineDistance||0).toFixed(1)} m`],
      [`最快`, `${((r.fastestAdjacentSpeed||0)*3.6).toFixed(1)} km/h`]
    ];

    for(const [label,value] of pairs){
      const item=document.createElement('span');
      item.textContent=`${label}: ${value}`;
      stats.appendChild(item);
    }

    const actions=document.createElement('div');
    actions.className='record-actions';

    const exportBtn=document.createElement('button');
    exportBtn.textContent='匯出';
    exportBtn.onclick=()=>download('campus-track.json',JSON.stringify(r,null,2),'application/json');

    const deleteBtn=document.createElement('button');
    deleteBtn.textContent='刪除';
    deleteBtn.onclick=()=>{
      if(confirm('確定要刪除此筆紀錄？')){
        records=records.filter(x=>x!==r);
        persist();
        renderHistory();
      }
    };

    actions.appendChild(exportBtn);
    actions.appendChild(deleteBtn);

    info.appendChild(title);
    info.appendChild(sub);
    info.appendChild(stats);
    row.appendChild(thumb);
    row.appendChild(info);
    row.appendChild(actions);

    root.appendChild(row);
  }
}

$('openSetup').onclick=()=>$('setupDialog').showModal();
$('closeSetup').onclick=()=>$('setupDialog').close();
$('energyInfo').onclick=()=>$('energyDialog').showModal();
$('closeEnergy').onclick=()=>$('energyDialog').close();

$('todayDate').textContent=new Date().toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'short'});

document.querySelectorAll('[data-filter]').forEach(button=>{
  button.onclick=()=>{
    historyFilter=button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b=>{
      b.classList.toggle('selected', b===button);
      b.setAttribute('aria-pressed', String(b===button));
    });
    renderHistory();
  };
});

$('exportAll').onclick=()=>exportCSV(records);
$('deleteAll').onclick=()=>{
  if(records.length && confirm('永久刪除此裝置全部運動紀錄？')){
    records=[];
    persist();
    renderHistory();
  }
};

document.addEventListener('visibilitychange',()=>{
  if(document.hidden && session?.state==='running') pause('頁面已離開前景，為避免漏記與錯估已自動暫停。回到頁面後按「繼續」。');
});

window.addEventListener('beforeunload',e=>{
  if(session && session.state!=='finished'){
    e.preventDefault();
    e.returnValue='';
  }
});

setInterval(()=>{
  if(session?.state==='running'&&!session.demo&&Date.now()-lastSignal>30000){
    pause('超過 30 秒沒有 GPS 更新，已自動暫停。請檢查定位後按繼續。');
  }
  render();
},1000);

renderHistory();
render();

if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});

document.querySelectorAll('.sidenav a[href^="#"]').forEach(a=>{
  a.addEventListener('click',()=>{
    document.querySelectorAll('.sidenav a').forEach(n=>n.classList.toggle('active',n===a));
    document.querySelector('.breadcrumb strong').textContent=a.textContent.trim();
  });
});
