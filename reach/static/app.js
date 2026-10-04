'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const num = value => value == null ? 'Unavailable' : Number(value).toLocaleString('en-GB', {maximumFractionDigits:1});
const empty = text => '<p class="empty">'+esc(text)+'</p>';
const date = value => value ? new Date(value).toLocaleString('en-GB') : 'Never';
const shift = (value,n) => {const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
let data, selected='all';
const chosen = () => Object.entries(data.domains).filter(([domain]) => selected==='all'||domain===selected);
function table(headers, rows) {
  if (!rows.length) return empty('No measured data in this coverage period.');
  return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+esc(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function windowData(entries,n,previous=false) {
  const ends=entries.map(([,v])=>(v.days||[]).filter(d=>!d.partial).map(d=>d.date).sort().at(-1));
  if (ends.some(d=>!d)) return {rows:[],complete:false};
  const end=ends.sort()[0], finish=shift(end,previous?-n:0), start=shift(finish,1-n);
  const rows=entries.flatMap(([domain,v])=>(v.days||[]).filter(d=>d.date>=start&&d.date<=finish).map(d=>({...d,domain})));
  const complete=entries.every(([domain])=>Array.from({length:n},(_,i)=>shift(start,i)).every(day=>rows.some(d=>d.domain===domain&&d.date===day&&!d.partial)));
  return {rows,complete,start,end:finish};
}
function merged(rows,key) {
  const result={};
  for (const row of rows) for(const [name,n] of Object.entries(row[key]||{})) result[name]=(result[name]||0)+n;
  return Object.entries(result).sort((a,b)=>b[1]-a[1]);
}
function render() {
  if (!data) return;
  const entries=chosen(), n=Number($('period').value), current=windowData(entries,n), prior=windowData(entries,n,true);
  $('view-title').textContent=selected==='all'?'Combined overview':selected;
  const all=entries.flatMap(([domain,v])=>(v.days||[]).map(d=>({...d,domain}))), dates=all.map(d=>d.date).sort();
  $('coverage').textContent=dates.length?'Available log observations: '+dates[0]+' to '+dates.at(-1)+'. Partial days are excluded from comparisons.':'No Apache coverage connected.';
  const sources=entries.flatMap(([,v])=>Object.values(v.sources||{})), errors=sources.filter(s=>s.error);
  $('notice').className='notice'+(errors.length?' error':'');
  $('notice').textContent='View fetched '+date(data.generated_at)+'. '+(errors.length?errors.length+' source issue(s); prior good data is retained.':'Each source has its own coverage and refresh time below.');
  const sum=(rows,key)=>rows.reduce((a,d)=>a+(d[key]||0),0);
  const pv=current.complete?sum(current.rows,'page_views'):null, sessions=current.complete?sum(current.rows,'sessions'):null;
  const comparison=key=>!current.complete||!prior.complete?'Comparison unavailable: insufficient complete days.':sum(prior.rows,key)===0?'Previous period was zero; percentage change undefined.':((sum(current.rows,key)/sum(prior.rows,key)-1)*100).toFixed(1)+'% versus preceding '+n+' days.';
  const observed=all.length?sum(all,'page_views'):null;
  $('metrics').innerHTML=[['Page views · '+n+' complete days',pv,comparison('page_views')],['Estimated sessions · '+n+' days',sessions,(selected==='all'?'Sum of per-domain estimates; not unique people. ':'')+comparison('sessions')],['Observed baseline page views',observed,dates.length?dates[0]+' to '+dates.at(-1)+'; includes partial days.':'No connected log coverage.']].map(([label,value,detail])=>'<div class="card"><p class="label">'+esc(label)+'</p><strong>'+num(value)+'</strong><p>'+esc(detail)+'</p></div>').join('');
  if(all.length) {
    const end=dates.at(-1), start=shift(end,1-Math.min(n,90)), points=[];
    for(let d=start;d<=end;d=shift(d,1)) {
      const dayRows=entries.map(([domain,v])=>v.days.find(x=>x.date===d));
      points.push({date:d,known:dayRows.every(Boolean),partial:dayRows.some(x=>x?.partial),count:dayRows.every(Boolean)?sum(dayRows,'page_views'):null});
    }
    const max=Math.max(1,...points.map(p=>p.count||0)), width=960/points.length;
    $('trend').innerHTML='<svg class="trend-svg" viewBox="0 0 960 180" role="img" aria-label="Daily page views; pale bars are partial days; missing days are unknown">'+points.map((p,i)=>p.known?'<rect x="'+(i*width+2)+'" y="'+(170-(p.count/max*155))+'" width="'+Math.max(1,width-5)+'" height="'+Math.max(1,p.count/max*155)+'" fill="'+(p.partial?'#a5c8bc':'#398b79')+'"><title>'+esc(p.date+': '+p.count+' page views'+(p.partial?' (partial)':''))+'</title></rect>':'<text x="'+(i*width+width/2)+'" y="165" font-size="12" text-anchor="middle" fill="#607377"><title>'+esc(p.date+': unknown')+'</title>?</text>').join('')+'</svg><div class="dates"><span>'+start+'</span><span>'+end+'</span></div><p class="small">Pale bars: partial days. ? = unknown. Origin log observations; cached/CDN visits may be missing.</p>';
  } else $('trend').innerHTML=empty('Not connected. No daily trend is available.');
  const rows=current.rows;
  const periodNote=current.complete?'Latest '+n+' complete calendar days.':'Available observations in the latest '+n+'-day window; incomplete coverage.';
  $('pages').innerHTML='<p class="small">'+esc(periodNote)+'</p>'+table(['Page','Views'],merged(rows,'pages').slice(0,15).map(([path,n])=>[path,num(n)]));
  $('referrals').innerHTML='<p class="small">'+esc(periodNote)+'</p>'+table(['Referral host','Views'],merged(rows,'referrals').slice(0,15).map(([host,n])=>[host,num(n)]));
  $('campaigns').innerHTML='<p class="small">'+esc(periodNote)+'</p>'+table(['Source','Medium','Campaign','Content','Tagged views'],merged(rows,'campaigns').slice(0,25).map(([tag,n])=>[...tag.split('|'),num(n)]));
  $('actions').innerHTML=entries.map(([domain,v])=>'<h3>'+esc(domain)+' · useful actions</h3>'+(v.actions?.status==='collecting'?'<p class="small">Measured occurrences since '+esc(date(v.actions.since))+'.</p>'+table(['Date','Walk starts','Ask uses','Narration plays'],v.actions.days.map(d=>[d.date,num(d.walk_start??null),num(d.ask_use??null),num(d.narration_play??null)])):empty('Not measured. Website instrumentation has not been changed; logs alone do not prove walk starts or narration playback.'))).join('');
  $('search').innerHTML=entries.map(([domain,v])=>{
    const source=v.sources.search_console, daily=v.search?.daily||[];
    let output='<h3>'+esc(domain)+' <span class="pill '+(source.status==='connected'?'':'warn')+'">'+esc(source.status.replaceAll('_',' '))+'</span></h3>';
    if (!daily.length) output+=empty('No Search Console results connected. Missing search metrics are not zero.');
    else {
      const latest=daily.map(d=>d.date).sort().at(-1), searchRows=daily.filter(d=>d.date>=shift(latest,1-n));
      const clicks=searchRows.reduce((a,d)=>a+d.clicks,0), impressions=searchRows.reduce((a,d)=>a+d.impressions,0);
      output+=table(['Clicks','Impressions','CTR','Average position'],[[num(clicks),num(impressions),impressions?(clicks/impressions*100).toFixed(2)+'%':'Undefined',impressions?num(searchRows.reduce((a,d)=>a+d.position*d.impressions,0)/impressions):'Undefined']]);
      output+='<p class="small">Latest available '+n+'-day search window ending '+esc(latest)+'. Query and landing-page tables cover the source date range: '+esc(source.coverage_start)+' to '+esc(source.coverage_end)+'. Query omissions apply.</p>';
    }
    output+='<details><summary>Queries & landing pages</summary>'+table(['Query','Clicks','Impressions','CTR','Position'],(v.search?.queries||[]).slice(0,20).map(r=>[(r.keys||[]).join(' '),num(r.clicks),num(r.impressions),(r.ctr*100).toFixed(2)+'%',num(r.position)]))+table(['Landing page','Clicks','Impressions','CTR','Position'],(v.search?.pages||[]).slice(0,20).map(r=>[(r.keys||[]).join(' '),num(r.clicks),num(r.impressions),(r.ctr*100).toFixed(2)+'%',num(r.position)]))+'</details>';
    if(source.setup&&source.status!=='connected') output+='<details><summary>Exact connection setup</summary><p>'+esc(source.setup)+'</p></details>';
    return output;
  }).join('');
  $('seo').innerHTML=entries.map(([domain,v])=>'<div class="seo-domain"><h3>'+esc(domain)+'</h3><p class="small">Last audit: '+date(v.seo.checked_at)+'</p>'+table(['Check','Finding','Status'],(v.seo.findings||[]).map(f=>[f.check,f.detail,f.status]))+'<p class="small">Indexing: '+esc(v.seo.indexing?.detail||'Not connected. HTML checks cannot establish Google indexing status.')+'</p><p class="small">Mobile performance: '+esc(v.seo.performance?.detail||'Not measured.')+'</p></div>').join('');
  $('sources').innerHTML=entries.map(([domain,v])=>'<h3>'+esc(domain)+'</h3>'+Object.entries(v.sources).map(([name,s])=>{
    const stale=s.last_success&&Date.now()-Date.parse(s.last_success)>48*3600000;
    return '<div class="source"><div class="source-head"><strong>'+esc(name.replaceAll('_',' '))+'</strong><span class="pill '+(s.status!=='connected'||stale?'warn':'')+'">'+esc(s.status.replaceAll('_',' '))+(stale?' · stale':'')+'</span></div><p>Last success: '+date(s.last_success)+(s.coverage_start?' · Coverage '+esc(s.coverage_start)+' to '+esc(s.coverage_end):'')+'</p>'+(s.error?'<p class="error-text">'+esc(s.error)+'</p>':'')+(name==='goaccess'&&s.status==='connected'?'<a href="./reports/'+(domain==='lozknowles.com'?'lozknowles':'collingham')+'.html">Open existing private GoAccess report</a>':'')+'</div>';
  }).join('')).join('');
  $('definitions').innerHTML=data.definitions.map(t=>'<p>'+esc(t)+'</p>').join('');
}
async function load() {
  $('refresh').disabled=true;
  try {
    const response=await fetch('./api/overview',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const value=await response.json();
    if(!value.domains)throw new Error('Invalid report response');
    data=value;render();
  } catch(error) {
    $('notice').className='notice error';
    $('notice').textContent='Portal refresh failed ('+error.message+'). '+(data?'Last displayed good data is retained.':'No data is available. Check authentication and service health.');
  } finally {$('refresh').disabled=false;}
}
document.querySelectorAll('[data-domain]').forEach(button=>button.addEventListener('click',()=>{selected=button.dataset.domain;document.querySelectorAll('[data-domain]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
$('period').addEventListener('change',render);$('refresh').addEventListener('click',load);
$('builder').addEventListener('submit',event=>{
  event.preventDefault();
  try {
    const fields=new FormData(event.target), url=new URL(fields.get('url'));
    if(url.protocol!=='https:'||!['lozknowles.com','www.lozknowles.com','collingham.org','www.collingham.org'].includes(url.hostname)||url.username||url.password||url.port||url.search||url.hash||/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname))throw new Error('Use a clean HTTPS URL on one of the two websites, without credentials, port, query parameters or fragment.');
    const valid=/^[a-z0-9][a-z0-9_-]{0,47}$/;
    for(const key of ['source','medium','campaign','content']) {
      const value=String(fields.get(key)||'');
      if(key==='content'&&!value)continue;
      if(!valid.test(value))throw new Error('Campaign fields use lowercase letters, numbers, hyphens or underscores; maximum 48 characters.');
      url.searchParams.set('utm_'+key,value);
    }
    $('builder-result').innerHTML='<label>Campaign link<input readonly value="'+esc(url.href)+'"></label><p class="small">Copy this for a future promotion. Existing links and QR codes are unchanged.</p>';
  } catch(error){$('builder-result').textContent=error.message;}
});
load();

