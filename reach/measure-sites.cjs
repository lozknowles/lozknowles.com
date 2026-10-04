const fs=require('fs');
const {chromium}=require('/fast/repos/LocalWalks/node_modules/@playwright/test');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP lozknowles.com 100.94.174.25, MAP www.lozknowles.com 100.94.174.25, MAP collingham.org 100.94.174.25, MAP www.collingham.org 100.94.174.25']});
 const output={};
 try{
  for(const [domain,url]of [['lozknowles.com','https://lozknowles.com/'],['collingham.org','https://www.collingham.org/']]){
   const context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2.625,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 HeadlessChrome ReachTechnicalAudit'});
   const page=await context.newPage();
   await page.addInitScript(()=>{
    window.lab={lcp:null,cls:0};
    new PerformanceObserver(list=>{for(const item of list.getEntries())window.lab.lcp=item.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
    new PerformanceObserver(list=>{for(const item of list.getEntries())if(!item.hadRecentInput)window.lab.cls+=item.value;}).observe({type:'layout-shift',buffered:true});
   });
   try{
    const response=await page.goto(url,{waitUntil:'load',timeout:60000});
    await page.waitForTimeout(5000);
    const metrics=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {lcp_ms:window.lab.lcp,cls:window.lab.cls,dom_content_loaded_ms:n.domContentLoadedEventEnd,load_ms:n.loadEventEnd,resource_transfer_bytes:performance.getEntriesByType('resource').reduce((a,e)=>a+e.transferSize,0)};});
    output[domain]={status:response.status()===200?'measured':'error',checked_at:new Date().toISOString(),url,status_code:response.status(),method:'Chromium mobile lab, Pixel 412x915, no throttling, direct production origin via Tailscale; not field Core Web Vitals or a Lighthouse score',metrics,detail:'Pixel-size direct-origin lab: LCP '+(metrics.lcp_ms==null?'not observed':Math.round(metrics.lcp_ms)+' ms')+', CLS '+metrics.cls.toFixed(3)+', DOMContentLoaded '+Math.round(metrics.dom_content_loaded_ms)+' ms. Unthrottled lab; not field Core Web Vitals.'};
    await page.screenshot({path:'/tmp/reach-mobile-'+domain+'.png',fullPage:true});
   }catch(error){output[domain]={status:'error',checked_at:new Date().toISOString(),detail:'Mobile lab navigation failed: '+error.message};}
   await context.close();
  }
 }finally{await browser.close();}
 fs.writeFileSync('/tmp/reach-mobile-performance.json',JSON.stringify(output,null,2),{mode:0o600});
 console.log(JSON.stringify(output));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
