(function(root){
const rad=n=>n*Math.PI/180;

function distance(a,b){
  const dlat=rad(b.lat-a.lat),dlon=rad(b.lng-a.lng);
  const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}

function calories(met,kg,seconds){
  return met*3.5*kg/200*seconds/60;
}

// 直線距離（起點到終點）
function straightLineDistance(start,end){
  if(!start||!end) return 0;
  return distance(start,end);
}

// 平均速度（m/s）
function avgSpeed(distanceMeters,seconds){
  if(!Number.isFinite(seconds)||seconds<=0) return 0;
  return distanceMeters/seconds;
}

// 最快相鄰點速度（m/s）
function fastestAdjacentSpeed(points){
  if(!Array.isArray(points)||points.length<2) return 0;
  let fastest=0;
  for(let i=1;i<points.length;i++){
    const prev=points[i-1],curr=points[i];
    const dt=(curr.t-prev.t)/1000;
    if(!Number.isFinite(dt)||dt<=0) continue;
    const d=distance(prev,curr);
    if(d>0){
      const speed=d/dt;
      if(speed>fastest) fastest=speed;
    }
  }
  return fastest;
}

// 段數：每一次有效相鄰點都算一段
function segmentCount(points){
  if(!Array.isArray(points)||points.length<2) return 0;
  let count=0;
  for(let i=1;i<points.length;i++){
    const prev=points[i-1],curr=points[i];
    const dt=(curr.t-prev.t)/1000;
    if(!Number.isFinite(dt)||dt<=0) continue;
    const d=distance(prev,curr);
    if(d>0) count++;
  }
  return count;
}

function accept(previous,p){
  if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||!Number.isFinite(p.t)||!Number.isFinite(p.accuracy)||Math.abs(p.lat)>90||Math.abs(p.lng)>180||p.accuracy<0||p.accuracy>35)return {ok:false,reason:'GPS 定位不夠穩定，請在戶外空曠處再試一次。'};
  if(!previous) return {ok:true,meters:0,break:false};
  const dt=(p.t-previous.t)/1000;
  if(dt<=0) return {ok:false,reason:'GPS 時間順序異常，請重新定位。'};
  const d=distance(previous,p);
  if(d/dt>8) return {ok:false,reason:'GPS 跳動過大，請檢查定位品質。'};
  if(d<4) return {ok:true,meters:0,break:false};
  return {ok:true,meters:d,break:false};
}

const api={distance,calories,straightLineDistance,avgSpeed,fastestAdjacentSpeed,segmentCount,accept};

if(typeof module!=='undefined')module.exports=api;
else root.MoveCore=api;
})(typeof window!=='undefined'?window:globalThis);
