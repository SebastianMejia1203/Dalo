/** Browser regression for the thumbnail gallery. Run after npm run build.
 * Uses Playwright local-file routing so the check needs no running server.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'data/inspection'), { recursive: true });
const dist = path.join(root, 'web/dist/web/browser');

(async () => {
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.CHROMIUM_PATH || 'C:/Users/okash/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
    args:['--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1200}});
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(error.message));
    const cameraChecks=[];
    const animationRequests = [];
    let releaseSecond, notifySecond;
    const secondGate=new Promise(resolve=>releaseSecond=resolve);
    const secondRequested=new Promise(resolve=>notifySecond=resolve);
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if(url.hostname !== 'dalo.local')return route.abort();
      const relative = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const file = path.resolve(dist,'.'+relative);
      if(!file.startsWith(dist+path.sep) || !fs.existsSync(file))return route.fulfill({status:404,body:'Missing local asset'});
      if(relative.endsWith('.vrma'))animationRequests.push(relative);
      if(relative.endsWith('bienvenido.vrma')){
        notifySecond();
        await secondGate;
      }
      const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
        '.json':'application/json','.css':'text/css','.wasm':'application/wasm','.webp':'image/webp'}[path.extname(file)] || 'application/octet-stream';
      await route.fulfill({contentType:type,body:fs.readFileSync(file)});
    });
    await page.addInitScript(() => {
      window.previewContexts=0; window.previewDraws=0;
      window.livePreviewContexts=0;
      const canvases=new WeakSet(), original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){
        const result=original.call(this,type,...args);
        if(type.startsWith('webgl') && result && !canvases.has(this)){
          canvases.add(this);window.previewContexts++;window.livePreviewContexts++;
          this.addEventListener('webglcontextlost',()=>window.livePreviewContexts--,{once:true});
        }
        return result;
      };
      for(const prototype of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]){
        for(const name of ['drawElements','drawArrays']){
          const draw=prototype[name]; prototype[name]=function(...args){window.previewDraws++;return draw.apply(this,args);};
        }
      }
    });
    await page.goto('http://dalo.local/',{waitUntil:'networkidle'});
    await page.locator('#nav-expresiones').click();
    await page.locator('.miniatura-avatar img').first().waitFor({state:'visible'});
    await page.locator('.miniatura-avatar img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    assert.equal(await page.locator('.miniatura-avatar img').count(),8);
    assert.equal(await page.locator('app-expresiones app-avatar-lsc').count(),0);
    assert.equal(await page.evaluate(()=>window.previewContexts),0);
    assert.equal(animationRequests.length,0);
    await page.screenshot({path:path.join(root,'data/inspection/expresiones-miniaturas.png'),fullPage:true});
    const thumbs=page.locator('.miniatura-avatar');
    const frames=()=>page.evaluate(()=>new Promise(resolve=>{
      let count=0;const tick=()=>++count===4?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);
    }));
    const checkCamera=async(container,label)=>{
      const pause=container.getByRole('button',{name:'Pausar avatar',exact:true});
      if(await pause.isVisible())await pause.click();
      await frames();
      const canvas=container.locator('canvas');
      const box=await canvas.boundingBox();
      const x=box.x+box.width*.55,y=box.y+box.height*.45;
      await page.mouse.move(x,y);
      await page.mouse.down();
      await page.mouse.move(x+100,y+15,{steps:10});
      await page.mouse.up();
      const released=await page.evaluate(()=>window.previewDraws);
      await frames();
      assert.ok(await page.evaluate(()=>window.previewDraws)>released,
        'Paused camera must continue damping after releasing the mouse: '+label);
      for(const name of ['Acercar la vista','Alejar la vista','Girar a la izquierda','Girar a la derecha','Subir la vista','Bajar la vista']){
        const before=await page.evaluate(()=>window.previewDraws);
        await container.getByRole('button',{name,exact:true}).click();
        await frames();
        assert.ok(await page.evaluate(()=>window.previewDraws)>before,name+' must redraw: '+label);
      }
      await page.mouse.move(x,y);
      let before=await page.evaluate(()=>window.previewDraws);
      await page.mouse.wheel(0,-180);
      await frames();
      assert.ok(await page.evaluate(()=>window.previewDraws)>before,'Mouse zoom must redraw: '+label);
      before=await page.evaluate(()=>window.previewDraws);
      await page.mouse.down({button:'right'});
      await page.mouse.move(x+20,y+40,{steps:5});
      await page.mouse.up({button:'right'});
      await frames();
      assert.ok(await page.evaluate(()=>window.previewDraws)>before,'Mouse pan must redraw: '+label);
      await page.evaluate(()=>new Promise((resolve,reject)=>{
        let previous=window.previewDraws,stable=0,total=0;
        const tick=()=>{
          const now=window.previewDraws;
          stable=now===previous?stable+1:0;previous=now;
          if(stable===6)return resolve();
          if(++total===250)return reject(new Error('Camera keeps drawing after settling'));
          requestAnimationFrame(tick);
        };requestAnimationFrame(tick);
      }));
      cameraChecks.push({view:label,pausedDamping:true,buttons:true,wheel:true,pan:true,idleStops:true});
    };
    await thumbs.nth(0).hover();
    await page.waitForFunction(()=>window.previewContexts===1 && window.previewDraws>0);
    await page.evaluate(()=>window.savedPreviewCanvas=document.querySelector('.reproductor-compartido canvas'));
    assert.equal(animationRequests.length,1);
    const playing=await page.evaluate(()=>window.previewDraws);
    await frames();
    assert.ok(await page.evaluate(()=>window.previewDraws)>playing,'Hover must animate after loading');
    await page.mouse.move(0,0);
    await page.locator('.reproductor-compartido[hidden]').waitFor({state:'attached'});
    await frames(); const paused=await page.evaluate(()=>window.previewDraws);
    await frames(); assert.equal(await page.evaluate(()=>window.previewDraws),paused,'Hidden preview must stop drawing');
    const secondAnimation=page.waitForResponse(response=>response.url().includes('bienvenido.vrma'));
    secondAnimation.catch(()=>{}); // The browser also closes if an earlier assertion fails.
    await thumbs.nth(1).hover();
    await secondRequested;
    assert.equal(await page.locator('.reproductor-compartido').evaluate(element=>getComputedStyle(element).visibility),'hidden',
      'Keep the thumbnail visible instead of showing the previous sign while loading');
    releaseSecond();
    await secondAnimation;
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.reproductor-compartido')).visibility==='visible');
    assert.equal(await page.locator('app-expresiones app-avatar-lsc').count(),1);
    assert.equal(await page.evaluate(()=>window.savedPreviewCanvas===document.querySelector('.reproductor-compartido canvas')),true);
    assert.equal(await page.evaluate(()=>window.previewContexts),1);
    await page.mouse.move(0,0);
    await thumbs.nth(0).hover();
    await frames();
    assert.equal(animationRequests.length,2,'Cached preview must not download again');
    await page.mouse.move(0,0);
    await thumbs.nth(2).focus();
    await page.waitForFunction(()=>document.querySelector('.reproductor-compartido')?.hidden===false);
    await page.locator('[aria-label="Página siguiente"]').click();
    assert.equal(await page.locator('.reproductor-compartido').isHidden(),true);
    assert.equal(await page.locator('.miniatura-avatar img').count(),8);
    const contextsAfterSwitching=await page.evaluate(()=>window.previewContexts);
    const selected=thumbs.first();
    const signName=(await page.locator('.datos strong').first().textContent()).trim();
    const thumbnailWidth=(await selected.boundingBox()).width;
    await selected.click();
    const dialog=page.getByRole('dialog',{name:signName,exact:true});
    await dialog.waitFor({state:'visible'});
    await dialog.locator('canvas').waitFor({state:'visible'});
    await dialog.getByRole('button',{name:'Reproducir avatar desde el inicio'}).or(dialog.getByRole('button',{name:'Pausar avatar'})).or(dialog.getByRole('button',{name:'Reproducir avatar',exact:true})).first().waitFor({state:'visible'});
    assert.ok((await dialog.locator('canvas').boundingBox()).width>thumbnailWidth*2,'Modal must enlarge the animation');
    assert.equal(await page.locator('.reproductor-compartido').count(),0);
    await frames();
    assert.ok(await page.evaluate(()=>window.livePreviewContexts)<=1,'Only the modal renderer should stay active');
    await checkCamera(dialog,'Expresiones');
    await page.screenshot({path:path.join(root,'data/inspection/expresiones-modal.png'),fullPage:true});
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.querySelectorAll('app-expresiones app-avatar-lsc').length===0);
    assert.equal(await selected.evaluate(element=>element===document.activeElement),true,'Return focus to the thumbnail');
    await selected.press('Enter');
    await dialog.waitFor({state:'visible'});
    await dialog.getByRole('button',{name:'Cerrar animación'}).click();
    await dialog.waitFor({state:'hidden'});
    await selected.click();
    await dialog.waitFor({state:'visible'});
    await page.mouse.click(2,2);
    await dialog.waitFor({state:'hidden'});
    await page.locator('#nav-comunicar').click();
    await page.locator('#tab-es-lsc').click();
    await page.locator('#texto-es').fill('Hola');
    await page.locator('#btn-buscar').click();
    const communicator=page.locator('app-comunicador app-avatar-lsc');
    await communicator.locator('canvas').waitFor({state:'visible'});
    await communicator.getByRole('button',{name:'Acercar la vista'}).waitFor({state:'visible'});
    await checkCamera(communicator,'Comunicar');
    assert.deepEqual(pageErrors,[],'No application exceptions during camera interaction');
    const report={initialThumbnails:8,initialWebGLContexts:0,initialAnimationDownloads:0,
      contextsAfterSwitching,modalEnlarges:true,modalClosesWithEscapeButtonAndBackdrop:true,modalReturnsFocus:true,
      reusedCanvas:true,pausedWhenHidden:true,keyboardPreview:true,thumbnailDuringLoading:true,animatesOnHover:true,cameraChecks,pageErrors,animationRequests};
    fs.writeFileSync(path.join(root,'data/inspection/expresiones-performance.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
