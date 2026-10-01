(function(root){
 const State={MAX_PANES:4,idleDue:(last,now,seconds)=>seconds>0&&now-last>=seconds*1000,canTerminate:(confirmed)=>confirmed===true,nextFree:panes=>panes.findIndex(p=>!p),place:(panes,slot,session)=>{if(!Number.isInteger(slot)||slot<0||slot>=4)throw Error('Pane allow-list');const next=panes.slice(0,4);next[slot]=session;return next;}};
 if(typeof module!=='undefined')module.exports=State;else root.WoprState=State;
})(typeof globalThis!=='undefined'?globalThis:this);
