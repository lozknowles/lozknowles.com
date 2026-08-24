import { COURSES, SUBJECTS, SUBJECT_LINKS } from './courses.js';
import { normaliseGrades, parseResultsText, rankCourses, matchCourse } from './matcher-core.js';

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const state = { grades: [], interests: new Set(), cohort: [] };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

const COMMON_SUBJECTS = ['Mathematics','English Language','English Literature','Combined Science','Biology','Chemistry','Physics','Geography','History','Business','Computing','Art & Design','Sport','French','German','Spanish','Psychology','Sociology','Economics','Music'];

function setMode(mode){
  $$('.mode-panel').forEach(p => p.classList.toggle('active', p.id === `${mode}-mode`));
  $$('.tab').forEach(t => { const active=t.dataset.mode===mode; t.classList.toggle('active',active); t.setAttribute('aria-selected',active); });
}
$$('.tab').forEach(t=>t.addEventListener('click',()=>setMode(t.dataset.mode)));

function setStep(n){ $$('.step').forEach(s=>s.classList.toggle('active',Number(s.dataset.step)===n)); }
function showStudentPanel(id, step){ ['results-entry','verify-panel','interest-panel','matches-panel'].forEach(x=>$('#'+x).classList.toggle('hidden',x!==id)); setStep(step); $('#'+id).scrollIntoView({behavior:'smooth',block:'start'}); }

function subjectOptions(selected=''){ return ['','...'].concat(COMMON_SUBJECTS).map(s=>s==='...'?'':`<option value="${s}" ${s===selected?'selected':''}>${s||'Select subject'}</option>`).join(''); }
function addManualRow(subject='',grade=''){
  const row=document.createElement('div'); row.className='manual-row';
  row.innerHTML=`<select aria-label="Subject">${subjectOptions(subject)}</select><input aria-label="Grade" value="${grade}" maxlength="5" placeholder="Grade"><button class="remove-row" aria-label="Remove row">×</button>`;
  $('.remove-row',row).addEventListener('click',()=>row.remove()); $('#manual-rows').appendChild(row);
}
function readManualRows(root='#manual-rows'){ return $$('.manual-row',$(root)).map(row=>({subject:$('select',row).value,grade:$('input',row).value})).filter(x=>x.subject&&x.grade); }
function seedManual(rows){ $('#manual-rows').innerHTML=''; rows.forEach(r=>addManualRow(r.subject,r.grade)); if(!rows.length) for(let i=0;i<4;i++) addManualRow(); }
seedManual([]); $('#add-row').addEventListener('click',()=>addManualRow());

const GOLDEN = [
  {subject:'Mathematics',grade:'5'},{subject:'English Language',grade:'4'},{subject:'English Literature',grade:'3'},
  {subject:'Geography',grade:'3'},{subject:'Physics',grade:'2'},{subject:'Combined Science',grade:'5'}
];
$('#load-golden').addEventListener('click',()=>{ seedManual(GOLDEN); $('#ocr-text').value='Mathematics 5\nEnglish Language 4\nEnglish Literature 3\nGeography 3\nPhysics 2\nCombined Science 5'; $('#ocr-status').textContent='Synthetic demo student loaded.'; });

function parseTextIntoRows(){
  const parsed=parseResultsText($('#ocr-text').value);
  if(parsed.length){ seedManual(parsed); $('#ocr-status').textContent=`Parsed ${parsed.length} grade${parsed.length===1?'':'s'} from extracted text. Please verify them.`; }
  else $('#ocr-status').textContent='No recognisable subject/grade pairs found. Use manual entry and verify against the source document.';
}
$('#parse-text').addEventListener('click',parseTextIntoRows);

$('#choose-file').addEventListener('click',()=>$('#result-file').click());
const drop=$('#drop-zone');
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
drop.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f) processFile(f)});
$('#result-file').addEventListener('change',e=>{if(e.target.files[0])processFile(e.target.files[0])});

async function processFile(file){
  $('#ocr-status').textContent=`Reading ${file.name}…`;
  try{
    if(/text|csv/.test(file.type)||/\.(txt|csv)$/i.test(file.name)){
      $('#ocr-text').value=await file.text(); parseTextIntoRows(); return;
    }
    if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
      const text=await extractPdf(file); $('#ocr-text').value=text; parseTextIntoRows(); return;
    }
    if(file.type.startsWith('image/')){
      const text=await ocrImage(file); $('#ocr-text').value=text; parseTextIntoRows(); return;
    }
    throw new Error('Unsupported file type');
  }catch(err){
    console.error(err); $('#ocr-status').textContent=`Could not automatically read this file: ${err.message}. You can still enter the grades manually.`;
  }
}

async function ensureTesseract(){
  if(window.Tesseract) return window.Tesseract;
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/tesseract/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('local OCR vendor bundle is not installed'));document.head.appendChild(s)});
  return window.Tesseract;
}
async function ocrImage(source){
  const T=await ensureTesseract(); $('#ocr-status').textContent='Running OCR locally in this browser…';
  const worker=await T.createWorker('eng',1,{workerPath:'./vendor/tesseract/worker.min.js',corePath:'./vendor/tesseract-core',langPath:'./vendor/tessdata',logger:m=>{if(m.status)$('#ocr-status').textContent=`OCR: ${m.status}${m.progress?` ${Math.round(m.progress*100)}%`:''}`}});
  try{const {data}=await worker.recognize(source);return data.text||''}finally{await worker.terminate()}
}
async function extractPdf(file){
  let pdfjs;
  try{pdfjs=await import('./vendor/pdfjs/pdf.mjs')}catch{throw new Error('local PDF vendor bundle is not installed')}
  pdfjs.GlobalWorkerOptions.workerSrc='./vendor/pdfjs/pdf.worker.mjs';
  const data=new Uint8Array(await file.arrayBuffer()); const pdf=await pdfjs.getDocument({data}).promise; let text='';
  const max=Math.min(pdf.numPages,5);
  for(let i=1;i<=max;i++){
    $('#ocr-status').textContent=`Reading PDF page ${i} of ${max}…`;
    const page=await pdf.getPage(i); const content=await page.getTextContent(); const pageText=content.items.map(x=>x.str).join(' ');
    if(pageText.trim().length>30){text+=pageText+'\n';continue}
    const viewport=page.getViewport({scale:1.7});const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;text+=await ocrImage(canvas)+'\n';
  }
  return text;
}

$('#to-verify').addEventListener('click',()=>{
  const rows=readManualRows(); if(!rows.length){$('#ocr-status').textContent='Add at least one subject and grade first.';return}
  state.grades=rows; renderVerify(); showStudentPanel('verify-panel',2);
});
function renderVerify(){
  const tbody=$('#verify-body'); tbody.innerHTML='';
  state.grades.forEach((g,i)=>{const tr=document.createElement('tr');tr.innerHTML=`<td><select class="text-input">${subjectOptions(g.subject)}</select></td><td><input class="text-input" value="${escapeHtml(g.grade)}" maxlength="5"></td><td><button class="remove-row" aria-label="Remove result">×</button></td>`;$('.remove-row',tr).addEventListener('click',()=>{state.grades.splice(i,1);renderVerify()});tbody.appendChild(tr)});
  const tr=document.createElement('tr');tr.innerHTML='<td colspan="3"><button class="secondary" id="verify-add">+ Add missing subject</button></td>';tbody.appendChild(tr);$('#verify-add').addEventListener('click',()=>{state.grades.push({subject:'',grade:''});renderVerify()});
}
function readVerify(){state.grades=$$('#verify-body tr').slice(0,-1).map(tr=>({subject:$('select',tr)?.value||'',grade:$('input',tr)?.value||''})).filter(x=>x.subject&&x.grade)}
$('#confirm-grades').addEventListener('click',()=>{readVerify();if(!state.grades.length)return;showStudentPanel('interest-panel',3)});
$$('[data-back]').forEach(b=>b.addEventListener('click',()=>showStudentPanel(b.dataset.back,b.dataset.back==='results-entry'?1:2)));

SUBJECTS.forEach(subject=>{const b=document.createElement('button');b.className='chip';b.type='button';b.textContent=subject;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>{const on=b.getAttribute('aria-pressed')==='true';b.setAttribute('aria-pressed',String(!on));if(on)state.interests.delete(subject);else state.interests.add(subject)});$('#interest-chips').appendChild(b)});

$('#run-match').addEventListener('click',()=>{readVerify();renderMatches();showStudentPanel('matches-panel',4)});
$('#edit-results').addEventListener('click',()=>showStudentPanel('verify-panel',2));
function renderMatches(){
  const ranked=rankCourses(state.grades,COURSES,[...state.interests],$('#career-text').value);
  const greens=ranked.filter(x=>x.status==='green').length; const ambers=ranked.filter(x=>x.status==='amber').length;
  $('#match-summary').textContent=`${ranked.length} encoded course${ranked.length===1?'':'s'} shown · ${greens} likely grade match${greens===1?'':'es'} · ${ambers} need closer checking.`;
  const list=$('#match-list');list.innerHTML='';
  ranked.forEach(result=>{
    const c=result.course; const card=document.createElement('article');card.className=`match-card ${result.status}`;
    const statusText={green:'Likely meets encoded grades',amber:'Near match / needs checking',red:'Does not meet encoded grades'}[result.status];
    card.innerHTML=`<div class="match-top"><div><span class="badge ${result.status}">${statusText}</span><h3>${c.title}</h3><p class="course-meta">${c.subject} · Level ${c.level||'Entry'} · ${c.campus}</p></div><div class="course-meta">Criteria checked ${c.checked}</div></div><p>${c.summary}</p><div class="checks">${result.checks.map(x=>`<div class="check ${x.pass?'pass':'fail'}"><strong>${x.label}</strong> — ${x.detail}</div>`).join('')}</div>${result.warnings.length?`<div class="warning-list"><strong>Still needs a human check</strong><ul>${result.warnings.map(w=>`<li>${w}</li>`).join('')}</ul></div>`:''}<p><a class="course-link" href="${c.url}" target="_blank" rel="noreferrer">Verify on official Lincoln College page ↗</a></p>`;
    list.appendChild(card);
  });
  if(!ranked.length) list.innerHTML='<div class="panel"><h3>No encoded courses matched those interests</h3><p>Try broadening the interests or use the official subject links below. This prototype deliberately does not invent eligibility rules for courses it has not encoded.</p></div>';
}
Object.entries(SUBJECT_LINKS).forEach(([s,u])=>{const a=document.createElement('a');a.href=u;a.target='_blank';a.rel='noreferrer';a.textContent=s;$('#subject-links').appendChild(a)});

// Adviser mode
COURSES.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.title;$('#adviser-course').appendChild(o)});
const SYNTHETIC=[
 {id:'S-001',interest:'Computing',grades:GOLDEN},
 {id:'S-002',interest:'Engineering',grades:[['Mathematics',7],['English Language',5],['Combined Science','6-6'],['Geography',5],['Business',5]].map(([subject,grade])=>({subject,grade:String(grade)}))},
 {id:'S-003',interest:'Business',grades:[['Mathematics',4],['English Language',4],['Business',5],['Geography',4],['History',4]].map(([subject,grade])=>({subject,grade:String(grade)}))},
 {id:'S-004',interest:'Health and Social Care',grades:[['Mathematics',4],['English Language',5],['Combined Science','4-4'],['Geography',4],['History',3]].map(([subject,grade])=>({subject,grade:String(grade)}))},
 {id:'S-005',interest:'Sport',grades:[['Mathematics',3],['English Language',3],['Combined Science','3-3'],['Sport',5]].map(([subject,grade])=>({subject,grade:String(grade)}))},
 {id:'S-006',interest:'Creative Arts',grades:[['Mathematics',3],['English Language',4],['Art & Design',6],['History',3]].map(([subject,grade])=>({subject,grade:String(grade)}))},
 {id:'S-007',interest:'Construction',grades:[['Mathematics',3],['English Language',3],['Combined Science',2],['Geography',2]].map(([subject,grade])=>({subject,grade:String(grade)}))},
 {id:'S-008',interest:'Computing',grades:[['Mathematics',5],['English Language',5],['Computing',6],['Combined Science','5-5'],['Business',4]].map(([subject,grade])=>({subject,grade:String(grade)}))},
 {id:'S-009',interest:'Catering',grades:[['Mathematics',3],['English Language',3],['Business',3],['Geography',3]].map(([subject,grade])=>({subject,grade:String(grade)}))},
 {id:'S-010',interest:'Childcare',grades:[['Mathematics',3],['English Language',4],['Combined Science','3-3'],['Geography',3]].map(([subject,grade])=>({subject,grade:String(grade)}))}
];
function selectedCourse(){return COURSES.find(c=>c.id===$('#adviser-course').value)||COURSES[0]}
function renderCourseRule(){const c=selectedCourse();$('#course-rule-card').innerHTML=`<strong>${c.title}</strong><br>${c.summary}<br><a href="${c.url}" target="_blank" rel="noreferrer">Official source ↗</a>`;renderCohort()}
$('#adviser-course').addEventListener('change',renderCourseRule);
$('#load-cohort').addEventListener('click',()=>{state.cohort=structuredClone(SYNTHETIC);renderCohort()});
function renderCohort(){const body=$('#cohort-results');body.innerHTML='';const c=selectedCourse();state.cohort.map(person=>({person,result:matchCourse(person.grades,c)})).sort((a,b)=>b.result.score-a.result.score).forEach(({person,result})=>{const tr=document.createElement('tr');tr.innerHTML=`<td><strong>${escapeHtml(person.id)}</strong></td><td>${escapeHtml(person.interest||'—')}</td><td><span class="badge ${result.status}">${result.status==='green'?'Likely':result.status==='amber'?'Check':'No'}</span></td><td>${result.checks.map(x=>`${x.pass?'✓':'!'} ${x.label}`).join('<br>')}</td>`;body.appendChild(tr)});if(!state.cohort.length)body.innerHTML='<tr><td colspan="4">Load the synthetic cohort or import a CSV to begin.</td></tr>'}
$('#cohort-file').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;state.cohort=parseCohortCsv(await f.text());renderCohort()});
function parseCsvLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(ch===','&&!q){out.push(cur.trim());cur=''}else cur+=ch}out.push(cur.trim());return out}
function parseCohortCsv(text){const lines=text.split(/\r?\n/).filter(Boolean);if(lines.length<2)return[];const h=parseCsvLine(lines[0]);const idI=h.findIndex(x=>/^id$/i.test(x)),intI=h.findIndex(x=>/^interest$/i.test(x));return lines.slice(1).map(line=>{const vals=parseCsvLine(line);const grades=h.map((name,i)=>({subject:name,grade:vals[i]})).filter((_,i)=>i!==idI&&i!==intI&&vals[i]);return{id:vals[idI]||`row-${Math.random().toString(36).slice(2,6)}`,interest:vals[intI]||'',grades}})}
renderCourseRule();
