'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), http=require('node:http'), path=require('node:path');
const {chromium}=require(process.env.REACH_PLAYWRIGHT||'/fast/repos/LocalWalks/node_modules/@playwright/test');
const root=path.resolve(__dirname,'../reach/static');
const source={status:'not_connected',last_success:null,error:null,setup:'Authorize the exact Search Console domain property with read-only access.'};
let fail=false;
const payload={generated_at:new Date().toISOString(),definitions:['Fixture definition: sessions are estimates, not unique people.'],domains:{}};
for(const domain of ['lozknowles.com','collingham.org'])payload.domains[domain]={days:[],sources:{apache:source,goaccess:source,search_console:source},search:{daily:[],queries:[],pages:[]},seo:{findings:[],performance:{status:'not_measured'}},actions:{status:'not_instrumented',days:[]}};
const server=http.createServer((req,res)=>{
 if(req.url==='/reach/api/overview'){res.writeHead(fail?503:200,{'Content-Type':'application/json'});return res.end(JSON.stringify(payload));}
 const names={'/reach/':'index.html','/reach/app.js':'app.js','/reach/style.css':'style.css'};
 if(!names[req.url]){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':req.url.endsWith('.js')?'text/javascript':req.url.endsWith('.css')?'text/css':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'"});
 res.end(fs.readFileSync(path.join(root,names[req.url])));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 try{
  const sizes=[['pixel',412,915],['ipad',768,1024],['desktop',1440,1000]];
  for(const [name,width,height]of sizes){
   const page=await browser.newPage({viewport:{width,height}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/reach/');
   await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('View fetched'));
   assert.match(await page.locator('#metrics').innerText(),/Unavailable/);
   assert.match(await page.locator('#search').innerText(),/Missing search metrics are not zero/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' overflow');
   await page.locator('[data-domain="collingham.org"]').click();
   assert.equal(await page.locator('#view-title').innerText(),'collingham.org');
   await page.locator('#period').selectOption('90');
   assert.match(await page.locator('#metrics').innerText(),/insufficient complete days/);
   await page.locator('[name=campaign]').fill('autumn-walks');
   await page.locator('#builder button').click();
   assert.match(await page.locator('#builder-result input').inputValue(),/utm_source=facebook/);
   await page.locator('[name=url]').fill('https://collingham.org.evil.test/');
   await page.locator('#builder button').click();
   assert.match(await page.locator('#builder-result').innerText(),/two websites/);
   await page.locator('[name=url]').fill('https://collingham.org/?private=text');
   await page.locator('#builder button').click();
   assert.match(await page.locator('#builder-result').innerText(),/without credentials/);
   for(const [domain,value]of Object.entries(payload.domains)){
    value.sources.apache={status:'connected',last_success:'2026-09-01T00:00:00Z'};
    value.days=Array.from({length:16},(_,i)=>({date:'2026-09-'+String(i+10).padStart(2,'0'),page_views:10,sessions:4,partial:i===0||i===15,pages:{'/walks/':10},referrals:{'example.test':8},campaigns:{'facebook|social|autumn|':3}}));
   }
   await page.locator('#period').selectOption('7');
   await page.locator('#refresh').click();
   await page.waitForFunction(()=>document.querySelector('#metrics').textContent.includes('70'));
   assert.match(await page.locator('#sources').innerText(),/stale/);
   assert.match(await page.locator('#metrics').innerText(),/0.0% versus preceding 7 days/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' populated overflow');
   fail=true;await page.locator('#refresh').click();
   await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Last displayed good data'));
   assert.match(await page.locator('#metrics').innerText(),/70/);fail=false;
   assert.deepEqual(errors,[]);
   await page.screenshot({path:'/tmp/reach-ui-'+name+'.png',fullPage:true});
   console.log(name+': missing/populated/stale/failed-source/builder/layout checks PASS');
   for(const value of Object.values(payload.domains)){value.days=[];value.sources.apache=source;}
   await page.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.message);process.exitCode=1;server.close();});

