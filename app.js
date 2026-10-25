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
      const v=d/dt;
      session.fastestAdjacentSpeed=Math.max(session.fastestAdjacentSpeed||0,v);
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
