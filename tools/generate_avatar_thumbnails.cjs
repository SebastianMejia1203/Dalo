/** Generate real, small WebP previews with the same VRM, lights and framing as Daló.
 * Run with Node and Playwright available. Requests are fulfilled from local files;
 * no HTTP server or external network is required.
 * The temporary page lives under data/inspection; no generation code ships to users.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'data/inspection'), { recursive: true });
const catalog = fs.readFileSync(path.join(root, 'web/src/app/catalog.ts'), 'utf8');
const entries = [...catalog.matchAll(/id: '([^']+)'[\s\S]*?animacionUrl: '([^']+)'/g)]
  .map((match) => ({ id: match[1], url: match[2] }));
entries.push(...JSON.parse(fs.readFileSync(path.join(root, 'web/src/app/cordialidad.json'), 'utf8'))
  .map(({ id }) => ({ id, url: `avatar/${id}.vrma` })));
const folder = path.join(root, 'web/public/avatar/miniaturas');
fs.mkdirSync(folder, { recursive: true });
const html = `<!doctype html><html><head><script type="importmap">{"imports":{
"three":"/web/node_modules/three/build/three.module.js",
"three/webgpu":"/web/node_modules/three/build/three.webgpu.js",
"three/tsl":"/web/node_modules/three/build/three.tsl.js",
"three/addons/":"/web/node_modules/three/examples/jsm/"
}}</script></head><body><canvas width="640" height="360"></canvas><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '/web/node_modules/@pixiv/three-vrm/lib/three-vrm.module.min.js';
import { VRMAnimationLoaderPlugin, VRMLookAtQuaternionProxy, createVRMAnimationClip } from '/web/node_modules/@pixiv/three-vrm-animation/lib/three-vrm-animation.module.min.js';
try {
 const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
 const gltf = await loader.loadAsync('/web/public/avatar/avatar-sample-1-superficie-codos.vrm');
 const vrm = gltf.userData.vrm; VRMUtils.rotateVRM0(vrm);
 if(vrm.lookAt){const proxy=new VRMLookAtQuaternionProxy(vrm.lookAt); proxy.name='lookAtQuaternionProxy'; vrm.scene.add(proxy);}
 const scene=new THREE.Scene(); scene.background=new THREE.Color(0xffffff); scene.add(vrm.scene);
 scene.add(new THREE.HemisphereLight(0xffffff,0xdfe8f0,1.5));
 const key=new THREE.DirectionalLight(0xffffff,1.6); key.position.set(2,3,4); scene.add(key);
 const fill=new THREE.DirectionalLight(0xeaf2ff,.6); fill.position.set(-3,1,2); scene.add(fill);
 const canvas=document.querySelector('canvas'); const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
 renderer.setSize(640,360,false); renderer.setPixelRatio(1);
 vrm.scene.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(vrm.scene), size=box.getSize(new THREE.Vector3());
 const camera=new THREE.PerspectiveCamera(32,640/360,.1,100);
 const center=new THREE.Vector3(box.min.x+size.x/2,box.min.y+size.y*.73,box.min.z+size.z/2);
 camera.position.set(center.x,center.y,box.max.z+(size.y*.72/2)/Math.tan(16*Math.PI/180)); camera.lookAt(center);
 const animations=new GLTFLoader(); animations.register(p=>new VRMAnimationLoaderPlugin(p));
 window.captureSign=async(url)=>{
  vrm.humanoid.resetNormalizedPose(); vrm.lookAt?.reset();
  const data=await animations.loadAsync('/web/public/'+url);
  const clip=createVRMAnimationClip(data.userData.vrmAnimations[0],vrm);
 const mixer=new THREE.AnimationMixer(vrm.scene);
 const action=mixer.clipAction(clip); action.play();
 // Apply only the initial resting pose. Never advance the sign's animation.
 mixer.setTime(0); action.paused=true;
 vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true);
 // Secondary bones must start from the invoked pose, not the import T-pose.
 // Settle hair/clothing before capturing, rather than saving the first update.
 vrm.springBoneManager?.reset();
 for(let frame=0;frame<240;frame++)vrm.update(1/60);
 vrm.scene.updateMatrixWorld(true);
 if(mixer.time!==0)throw new Error('Thumbnail must remain in the initial pose');
  renderer.render(scene,camera);
  const image=canvas.toDataURL('image/webp',.82); mixer.stopAllAction(); mixer.uncacheRoot(vrm.scene); return image;
 };
 window.ready=true;
}catch(error){window.failure=String(error);}
</script></body></html>`;
fs.writeFileSync(path.join(root, 'data/inspection/thumbnail-render.html'), html);
(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROMIUM_PATH || 'C:/Users/okash/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
    args: ['--enable-unsafe-swiftshader'] });
  try {
    const page=await browser.newPage();
    await page.route('http://dalo.local/**', async route => {
      const file=path.resolve(root,'.'+decodeURIComponent(new URL(route.request().url()).pathname));
      if(!file.startsWith(root+path.sep))return route.abort();
      const extension=path.extname(file);
      const type={'.html':'text/html','.js':'text/javascript','.json':'application/json'}[extension]||'application/octet-stream';
      await route.fulfill({contentType:type,body:fs.readFileSync(file)});
    });
    await page.goto('http://dalo.local/data/inspection/thumbnail-render.html');
    await page.waitForFunction(()=>window.ready || window.failure, null, {timeout:60000});
    const error=await page.evaluate(()=>window.failure); if(error)throw new Error(error);
    for(const entry of entries){
      const image=await page.evaluate(url=>window.captureSign(url),entry.url);
      if(!image.startsWith('data:image/webp;base64,'))throw new Error('WebP unavailable');
      fs.writeFileSync(path.join(folder,`${entry.id}.webp`),Buffer.from(image.split(',')[1],'base64'));
      console.log('MINIATURA',entry.id);
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
