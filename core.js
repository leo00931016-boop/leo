(function(root){
  const rad=n=>n*Math.PI/180;
  function distance(a,b){const dlat=rad(b.lat-a.lat),dlon=rad(b.lng-a.lng);const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
  function calories(met,kg,seconds){return met*3.5*kg/200*seconds/60;}
  function accept(previous,p){if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||!Number.isFinite(p.t)||!Number.isFinite(p.accuracy)||Math.abs(p.lat)>90||Math.abs(p.lng)>180||p.accuracy<0||p.accuracy>35)return {ok:false,reason:'GPS 資訊不完整或超出合法範圍，已忽略。'};if(!previous)return {ok:true,meters:0,break:false};const dt=(p.t-previous.t)/1000;if(dt<=0)return {ok:false,reason:'定位時間順序錯誤，已忽略此點。'};if(dt>30)return {ok:true,meters:0,break:true};const d=distance(previous,p);if(d/dt>8)return {ok:false,reason:'GPS 飄移過大，已忽略此點。'};if(d<Math.max(4,Math.min(12,(p.accuracy+previous.accuracy)*0.25)))return {ok:true,meters:0,break:false};return {ok:true,meters:d,break:false};}
  function summarizePoints(points, options={}){
    const met=Number(options.met)||3.5;
    const kg=Number(options.kg)||60;
    const valid=Array.isArray(points)?points.filter(point=>Number.isFinite(point?.lat)&&Number.isFinite(point?.lng)&&Number.isFinite(point?.t)&&Number.isFinite(point?.accuracy)&&Math.abs(point.lat)<=90&&Math.abs(point.lng)<=180&&point.accuracy>=0&&point.accuracy<=35):[];
    if(!valid.length){return {validPoints:0,segments:0,totalDistance:0,durationSeconds:0,avgSpeedKmh:0,caloriesKcal:0,straightDistance:0,fastestAdjacentSpeed:0};}
    let segments=1,totalDistance=0,durationSeconds=0,fastestAdjacentSpeed=0;
    for(let i=1;i<valid.length;i++){
      const previous=valid[i-1], current=valid[i];
      const dt=(current.t-previous.t)/1000;
      if(!Number.isFinite(dt)||dt<=0) continue;
      if(dt>30 || previous.break===true || current.break===true){segments++; continue;}
      const d=distance(previous,current); if(d<=0) continue;
      totalDistance+=d; durationSeconds+=dt; const speed=d/dt; if(speed>fastestAdjacentSpeed) fastestAdjacentSpeed=speed;
    }
    const avgSpeedKmh=durationSeconds>0?(totalDistance/durationSeconds)*3.6:0;
    const caloriesKcal=calories(met,kg,durationSeconds);
    const straightDistance=distance(valid[0],valid[valid.length-1]);
    return {validPoints:valid.length,segments,totalDistance:Number(totalDistance.toFixed(2)),durationSeconds:Number(durationSeconds.toFixed(2)),avgSpeedKmh:Number(avgSpeedKmh.toFixed(2)),caloriesKcal:Number(caloriesKcal.toFixed(2)),straightDistance:Number(straightDistance.toFixed(2)),fastestAdjacentSpeed:Number((fastestAdjacentSpeed||0).toFixed(2))};
  }
  const api={distance,calories,accept,summarizePoints};
  if(typeof module!=='undefined')module.exports=api; else root.MoveCore=api;
})(typeof window!=='undefined'?window:globalThis);
