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
const ids = [
  ...'abcdef'.split('').map((letter) => `character-female-${letter}`),
  ...'abcdef'.split('').map((letter) => `character-male-${letter}`),
];
const mimeTypes = { '.glb': 'model/gltf-binary', '.png': 'image/png', '.js': 'text/javascript' };

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
  if (!suppliedModels) {
    throw new Error('Informe a pasta Models com --models "C:\\...\\Models".');
  }
  const modelRoot = resolve(suppliedModels);
  const glbRoot = resolve(modelRoot, 'GLB format');
  const sourceRoot = glbRoot;
  const browser = chromePath();
  if (!browser) {
    throw new Error('Chrome, Edge ou Brave não encontrado. Informe o executável com --chrome.');
  }

  for (const id of ids) await readFile(join(sourceRoot, `${id}.glb`));
  await readFile(join(sourceRoot, 'Textures', 'colormap.png'));

  const html = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script><script type="module">
    import * as THREE from '/three/build/three.module.js';
    import { GLTFLoader } from '/three/examples/jsm/loaders/GLTFLoader.js';
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(512, 512, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    document.body.style.cssText = 'margin:0;width:512px;height:512px;background:transparent;overflow:hidden';
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1.3, 1.3, 1.3, -1.3, 0.1, 100);
    camera.position.set(3.2, 3.3, 8);
    camera.lookAt(0, 1, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb2a69a, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-3, 6, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xd9e7ff, 1.0); fill.position.set(4, 3, -4); scene.add(fill);
    const loader = new GLTFLoader();
    let active = null;
    window.renderPet = async (id) => {
      if (active) scene.remove(active);
      const gltf = await loader.loadAsync('/models/' + id + '.glb');
      active = gltf.scene;
      scene.add(active);
      const box = new THREE.Box3().setFromObject(active);
      const height = box.max.y - box.min.y;
      if (!(height > 0)) throw new Error('Modelo sem altura válida: ' + id);
      active.scale.setScalar(1.88 / height);
      active.updateMatrixWorld(true);
      box.setFromObject(active);
      active.position.x -= (box.max.x + box.min.x) / 2;
      active.position.y -= box.min.y;
      active.position.z -= (box.max.z + box.min.z) / 2;
      active.updateMatrixWorld(true);
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png').slice('data:image/png;base64,'.length);
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
    let target;
    let debugPort;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (chrome.exitCode !== null)
        throw new Error(
          `O navegador encerrou antes de abrir a página de renderização. ${browserOutput.trim()}`,
        );
      try {
        debugPort = Number(
          (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0],
        );
        const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) =>
          response.json(),
        );
        target = targets.find((item) => item.type === 'page');
        if (target) break;
      } catch {}
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
    if (!target) throw new Error('Não foi possível conectar ao navegador headless.');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolvePromise, reject) => {
      socket.addEventListener('open', resolvePromise, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    await sendJson(socket, 'Runtime.enable');
    await sendJson(socket, 'Page.enable');
    let rendererReady = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = await sendJson(socket, 'Runtime.evaluate', {
        expression: '({ ready: window.renderReady === true, error: window.renderError ?? null })',
        returnByValue: true,
      });
      const state = ready.result?.value;
      if (state?.error) throw new Error(`Falha ao iniciar o renderizador: ${state.error}`);
      if (state?.ready) {
        rendererReady = true;
        break;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
    if (!rendererReady) throw new Error('Tempo limite ao carregar o renderizador WebGL.');

    await mkdir(outputDir, { recursive: true });
    for (const id of ids) {
      const result = await sendJson(socket, 'Runtime.evaluate', {
        expression: `window.renderPet(${JSON.stringify(id)})`,
        awaitPromise: true,
        returnByValue: true,
      });
      const value = result.result?.value;
      if (typeof value !== 'string' || !value.length) {
        throw new Error(
          `Falha ao renderizar ${id}: ${result.exceptionDetails?.text ?? 'sem imagem'}`,
        );
      }
      await writeFile(join(outputDir, `${id}.png`), Buffer.from(value, 'base64'));
      console.log(`Renderizado ${id}.png`);
    }
  } finally {
    socket?.close();
    if (chrome.exitCode === null) {
      chrome.kill();
      await Promise.race([
        once(chrome, 'exit'),
        new Promise((resolvePromise) => setTimeout(resolvePromise, 5000)),
      ]);
    }
    server.close();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await rm(profile, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 9) throw error;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      }
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
