import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, 'assets/pets/kenney-mini-characters');
const animationDir = resolve(outputDir, 'animations');
const ids = [
  ...'abcdef'.split('').map((letter) => `character-female-${letter}`),
  ...'abcdef'.split('').map((letter) => `character-male-${letter}`),
];
const mimeTypes = { '.glb': 'model/gltf-binary', '.png': 'image/png', '.js': 'text/javascript' };
const stateClips = {
  idle: { clip: 'idle', loop: true },
  thinking: { clip: 'idle', loop: true },
  working: { clip: 'interact-right', loop: true },
  awaiting_approval: { clip: 'emote-no', loop: true },
  success: { clip: 'jump', loop: false },
  error: { clip: 'die', loop: false },
  paused: { clip: 'sit', loop: true },
};
const frameCount = 8;

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function chromePath() {
  const configured = argValue('--chrome', process.env.ODEKRAI_CHROME);
  if (configured) return resolve(configured);
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function sendJson(socket, method, params = {}) {
  const id = ++sendJson.sequence;
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Tempo limite em ${method}.`)), 30000);
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(message.error.message));
      else resolvePromise(message.result);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}
sendJson.sequence = 0;

async function main() {
  const suppliedModels = argValue('--models', '');
  if (!suppliedModels) throw new Error('Informe a pasta Models com --models "C:\\...\\Models".');
  const modelRoot = resolve(suppliedModels);
  const sourceRoot = resolve(modelRoot, 'GLB format');
  const browser = chromePath();
  if (!browser) throw new Error('Chrome, Edge ou Brave não encontrado. Informe --chrome.');
  const contactCharacter = argValue('--contact-sheet', '');
  if (contactCharacter && !ids.includes(contactCharacter)) {
    throw new Error(`Personagem inválido: ${contactCharacter}. IDs: ${ids.join(', ')}.`);
  }
  const renderIds = contactCharacter ? [contactCharacter] : ids;
  for (const id of renderIds) await readFile(join(sourceRoot, `${id}.glb`));
  await readFile(join(sourceRoot, 'Textures', 'colormap.png'));

  const html = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script><script type="module">
    import * as THREE from '/three/build/three.module.js';
    import { GLTFLoader } from '/three/examples/jsm/loaders/GLTFLoader.js';
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(512, 512, false); renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
    document.body.style.cssText = 'margin:0;width:512px;height:512px;background:transparent;overflow:hidden';
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1.3, 1.3, 1.3, -1.3, 0.1, 100);
    camera.position.set(3.2, 3.3, 8); camera.lookAt(0, 1, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb2a69a, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-3, 6, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xd9e7ff, 1.0); fill.position.set(4, 3, -4); scene.add(fill);
    const loader = new GLTFLoader(); let active = null; let mixer = null; let clips = [];
    async function load(id) {
      if (active) scene.remove(active);
      const gltf = await loader.loadAsync('/models/' + id + '.glb');
      active = gltf.scene; clips = gltf.animations; scene.add(active);
      const box = new THREE.Box3().setFromObject(active); const height = box.max.y - box.min.y;
      if (!(height > 0)) throw new Error('Modelo sem altura válida: ' + id);
      active.scale.setScalar(1.88 / height); active.updateMatrixWorld(true); box.setFromObject(active);
      active.position.x -= (box.max.x + box.min.x) / 2; active.position.y -= box.min.y;
      active.position.z -= (box.max.z + box.min.z) / 2; active.updateMatrixWorld(true);
      mixer = new THREE.AnimationMixer(active); return gltf;
    }
    function draw(time) { mixer.setTime(time); renderer.render(scene, camera); }
    function imageData() { return renderer.domElement.toDataURL('image/png').slice('data:image/png;base64,'.length); }
    window.inspectPet = async (id) => {
      const gltf = await load(id); const width=160, height=160, cols=4;
      const rows=Math.ceil(gltf.animations.length/cols); const canvas=document.createElement('canvas');
      canvas.width=cols*width; canvas.height=rows*(height+24); const ctx=canvas.getContext('2d');
      ctx.fillStyle='#f4f3ef'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.font='12px sans-serif'; ctx.fillStyle='#202020';
      for(let index=0; index<gltf.animations.length; index++) {
        const clip=gltf.animations[index]; mixer.stopAllAction(); mixer.clipAction(clip).play();
        draw(clip.duration/2); const x=(index%cols)*width, y=Math.floor(index/cols)*(height+24);
        ctx.drawImage(renderer.domElement,x,y,width,height); ctx.fillText(clip.name,x+4,y+height+17);
      }
      return { image: canvas.toDataURL('image/png').split(',')[1], clips:gltf.animations.map(c=>({name:c.name,duration:c.duration})) };
    };
    window.renderPet = async (id) => { await load(id); const idle=clips.find(c=>c.name.toLowerCase()==='idle');
      if(idle) { mixer.stopAllAction(); mixer.clipAction(idle).play(); draw(idle.duration/2); }
      else renderer.render(scene,camera); return imageData(); };
    window.renderSprite = async (id, clipName, frameTotal) => {
      await load(id);
      const clip=clips.find(c=>c.name===clipName); if(!clip) throw new Error('Clipe ausente: '+clipName);
      mixer.stopAllAction(); mixer.clipAction(clip).play();
      const frame=document.createElement('canvas'); frame.width=192; frame.height=192;
      const ctx=frame.getContext('2d'); const frames=[];
      for(let index=0;index<frameTotal;index++) {
        draw(clip.duration*index/frameTotal);
        ctx.clearRect(0,0,192,192); ctx.drawImage(renderer.domElement,0,0,192,192);
        frames.push(frame.toDataURL('image/png').split(',')[1]);
      }
      const sheet=document.createElement('canvas'); sheet.width=192*(frameTotal+1); sheet.height=192;
      const sheetContext=sheet.getContext('2d');
      for(let index=0;index<=frames.length;index++) {
        const image=new Image(); image.src='data:image/png;base64,'+frames[index % frames.length]; await image.decode();
        sheetContext.drawImage(image,index*192,0);
      }
      const data=sheet.toDataURL('image/webp',0.82);
      return { image:data.split(',')[1], mime:data.slice(5,data.indexOf(';')), duration:clip.duration, frames:frameTotal+1 };
    };
    window.renderReady = true;
  </script>`;

  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      let path;
      if (pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(html);
        return;
      }
      if (pathname.startsWith('/three/')) {
        path = resolve(
          root,
          'node_modules/three',
          decodeURIComponent(pathname.slice('/three/'.length)),
        );
        if (!path.startsWith(resolve(root, 'node_modules/three') + sep))
          throw new Error('Caminho inválido.');
      } else if (pathname.startsWith('/models/')) {
        const name = decodeURIComponent(pathname.slice('/models/'.length));
        path = resolve(sourceRoot, name);
        if (!path.startsWith(sourceRoot + sep)) throw new Error('Caminho inválido.');
      } else {
        response.writeHead(404).end();
        return;
      }
      const content = await readFile(path);
      response.writeHead(200, {
        'content-type': mimeTypes[extname(path).toLowerCase()] ?? 'application/octet-stream',
      });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const profile = await mkdtemp(join(tmpdir(), 'odekrai-pet-render-'));
  const chrome = spawn(
    browser,
    [
      '--headless=new',
      '--disable-background-networking',
      '--disable-default-apps',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--enable-webgl',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--remote-allow-origins=*',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `http://127.0.0.1:${port}/`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let browserOutput = '';
  chrome.stdout.setEncoding('utf8').on('data', (chunk) => (browserOutput += chunk));
  chrome.stderr.setEncoding('utf8').on('data', (chunk) => (browserOutput += chunk));
  let socket;
  try {
    let target, debugPort;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (chrome.exitCode !== null)
        throw new Error(`O navegador encerrou antes de abrir. ${browserOutput.trim()}`);
      try {
        debugPort = Number(
          (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0],
        );
        const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) =>
          r.json(),
        );
        target = targets.find((item) => item.type === 'page');
        if (target) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!target) throw new Error('Não foi possível conectar ao navegador headless.');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolvePromise, reject) => {
      socket.addEventListener('open', resolvePromise, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    await sendJson(socket, 'Runtime.enable');
    await sendJson(socket, 'Page.enable');
    for (let attempt = 0; attempt < 60; attempt++) {
      const ready = await sendJson(socket, 'Runtime.evaluate', {
        expression: 'window.renderReady===true',
        returnByValue: true,
      });
      if (ready.result?.value) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (contactCharacter) {
      const result = await sendJson(socket, 'Runtime.evaluate', {
        expression: `window.inspectPet(${JSON.stringify(contactCharacter)})`,
        awaitPromise: true,
        returnByValue: true,
      });
      const value = result.result?.value;
      if (!value?.image)
        throw new Error(`Falha ao inspecionar clipes: ${JSON.stringify(result.exceptionDetails)}`);
      const targetPath = resolve(
        argValue('--output', join(tmpdir(), `${contactCharacter}-animation-contact.png`)),
      );
      await writeFile(targetPath, Buffer.from(value.image, 'base64'));
      console.log(`Folha de contato: ${targetPath}`);
      console.log(
        `Clipes: ${value.clips.map((c) => `${c.name} (${c.duration.toFixed(2)} s)`).join(', ')}`,
      );
    } else if (process.argv.includes('--animations')) {
      await mkdir(outputDir, { recursive: true });
      await mkdir(animationDir, { recursive: true });
      let totalBytes = 0;
      for (const id of ids) {
        const rendered = new Map();
        for (const config of Object.values(stateClips)) {
          if (rendered.has(config.clip)) continue;
          const result = await sendJson(socket, 'Runtime.evaluate', {
            expression: `window.renderSprite(${JSON.stringify(id)},${JSON.stringify(config.clip)},${frameCount})`,
            awaitPromise: true,
            returnByValue: true,
          });
          const value = result.result?.value;
          if (!value?.image || value.mime !== 'image/webp')
            throw new Error(
              `Falha ao renderizar ${id}/${config.clip}: ${JSON.stringify(result.exceptionDetails)}`,
            );
          const file = `${id}-${config.clip}.webp`;
          const bytes = Buffer.from(value.image, 'base64');
          await writeFile(join(animationDir, file), bytes);
          totalBytes += bytes.length;
          rendered.set(config.clip, {
            file,
            bytes: bytes.length,
            frames: value.frames,
            fps: value.frames / value.duration,
          });
          console.log(`Renderizado ${file}: ${bytes.length} bytes`);
        }
        const animations = Object.fromEntries(
          Object.entries(stateClips).map(([state, config]) => [
            state,
            {
              ...config,
              file: rendered.get(config.clip).file,
              frames: rendered.get(config.clip).frames,
              fps: rendered.get(config.clip).fps,
              loop: config.loop,
            },
          ]),
        );
        await writeFile(
          join(animationDir, `${id}.json`),
          `${JSON.stringify({ id, frameWidth: 192, frameHeight: 192, animations }, null, 2)}\n`,
          'utf8',
        );
        const result = await sendJson(socket, 'Runtime.evaluate', {
          expression: `window.renderPet(${JSON.stringify(id)})`,
          awaitPromise: true,
          returnByValue: true,
        });
        const png = result.result?.value;
        if (typeof png !== 'string') throw new Error(`Falha ao renderizar quadro idle de ${id}.`);
        await writeFile(join(outputDir, `${id}.png`), Buffer.from(png, 'base64'));
      }
      console.log(
        `Tamanho total das folhas WebP: ${totalBytes} bytes (${(totalBytes / 1024 / 1024).toFixed(2)} MiB), limite 6 MiB.`,
      );
      if (totalBytes > 6 * 1024 * 1024)
        throw new Error('Sprites ultrapassam o orçamento de 6 MiB.');
    } else {
      await mkdir(outputDir, { recursive: true });
      for (const id of ids) {
        const result = await sendJson(socket, 'Runtime.evaluate', {
          expression: `window.renderPet(${JSON.stringify(id)})`,
          awaitPromise: true,
          returnByValue: true,
        });
        const value = result.result?.value;
        if (typeof value !== 'string' || !value.length)
          throw new Error(`Falha ao renderizar ${id}.`);
        await writeFile(join(outputDir, `${id}.png`), Buffer.from(value, 'base64'));
        console.log(`Renderizado ${id}.png (quadro idle)`);
      }
    }
  } finally {
    socket?.close();
    if (chrome.exitCode === null) {
      chrome.kill();
      await Promise.race([once(chrome, 'exit'), new Promise((r) => setTimeout(r, 5000))]);
    }
    server.close();
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await rm(profile, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 9) throw error;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
