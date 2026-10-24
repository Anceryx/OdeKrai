import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  evaluateMascotMotion,
  getFacePose,
  interpolateFacePose,
  motionForExpression,
  type MascotExpression,
  type MascotMotion,
} from '../core/mascot';
import { drawProgrammaticFace } from '../core/mascot-face';

const localModels = import.meta.glob<string>('../../assets/odekrai/character/*.glb', {
  eager: true,
  query: '?url',
  import: 'default',
});
const officialModelUrl = Object.values(localModels)[0];

export type MascotMotionRequest = { type: MascotMotion; startedAt: number; id: number };
export type MascotMetrics = { fps: number; triangles: number; drawCalls: number };

type OdekraiCompanionProps = {
  expression: MascotExpression;
  reduceMotion?: boolean;
  motionRequest?: MascotMotionRequest;
  lightIntensity?: number;
  modelScale?: number;
  modelOffset?: { x: number; y: number };
  cameraYaw?: number;
  cameraPitch?: number;
  cameraZoom?: number;
  animationsEnabled?: boolean;
  onMetrics?: (metrics: MascotMetrics) => void;
  className?: string;
};

type DisposableScene = {
  root: Group;
  originalScene: Group;
  clonedFaceMaterial: MeshStandardMaterial;
  originalFaceMaterial: MeshStandardMaterial;
};

function applyFaceTexture(
  model: Group,
  texture: CanvasTexture,
): { cloned: MeshStandardMaterial; original: MeshStandardMaterial } {
  const face = model.getObjectByName('ADA_Face_Display');
  if (!(face instanceof Mesh)) throw new Error('A malha ADA_Face_Display não foi encontrada.');
  const original = Array.isArray(face.material) ? face.material[0] : face.material;
  if (!(original instanceof MeshStandardMaterial || original instanceof MeshPhysicalMaterial)) {
    throw new Error('O material da malha facial não é compatível com o renderer.');
  }
  if (original.name !== 'ADA_Eyes_Emissive_ReplaceTexture') {
    throw new Error(`Material facial inesperado: ${original.name || 'sem nome'}.`);
  }

  const material = original.clone() as MeshStandardMaterial;
  material.name = 'ODEKRAI_Procedural_Face';
  material.map = texture;
  material.emissiveMap = texture;
  material.emissive = new Color('#ffffff');
  material.emissiveIntensity = 0.92;
  material.transparent = true;
  material.alphaTest = 0.015;
  material.depthTest = true;
  material.depthWrite = false;
  material.side = original.side;
  material.needsUpdate = true;
  face.material = material;
  face.renderOrder = 2;
  return { cloned: material, original: original as MeshStandardMaterial };
}

function disposeScene(
  scene: Group,
  faceMaterials: (MeshStandardMaterial | undefined)[] = [],
  faceTexture?: CanvasTexture,
) {
  const materials = new Set<MeshStandardMaterial | MeshPhysicalMaterial>();
  const textures = new Set<{ dispose: () => void }>();
  const geometries = new Set<{ dispose: () => void }>();
  const trackMaterial = (material: MeshStandardMaterial | MeshPhysicalMaterial) => {
    materials.add(material);
    for (const value of Object.values(material)) {
      if (
        value &&
        typeof value === 'object' &&
        'isTexture' in value &&
        'dispose' in value &&
        typeof value.dispose === 'function'
      ) {
        textures.add(value as { dispose: () => void });
      }
    }
  };
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const entry of list) {
      if (entry instanceof MeshStandardMaterial || entry instanceof MeshPhysicalMaterial) {
        trackMaterial(entry);
      }
    }
  });
  faceMaterials.forEach((material) => {
    if (material) trackMaterial(material);
  });
  if (faceTexture) textures.add(faceTexture);
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

export function OdekraiCompanion({
  expression,
  reduceMotion = false,
  motionRequest,
  lightIntensity = 1,
  modelScale = 1,
  modelOffset = { x: 0, y: 0 },
  cameraYaw = 0,
  cameraPitch = 0,
  cameraZoom = 1,
  animationsEnabled = true,
  onMetrics,
  className = '',
}: OdekraiCompanionProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef({
    expression,
    reduceMotion,
    motionRequest,
    lightIntensity,
    modelScale,
    modelOffset,
    cameraYaw,
    cameraPitch,
    cameraZoom,
    animationsEnabled,
    onMetrics,
  });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');

  settingsRef.current = {
    expression,
    reduceMotion,
    motionRequest,
    lightIntensity,
    modelScale,
    modelOffset,
    cameraYaw,
    cameraPitch,
    cameraZoom,
    animationsEnabled,
    onMetrics,
  };

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || !officialModelUrl) {
      setLoadError('O modelo oficial não está instalado neste checkout.');
      return;
    }

    let disposed = false;
    let animationRunning = false;
    let ready = false;
    let modelResources: DisposableScene | undefined;
    let loadedScene: Group | undefined;
    let faceTexture: CanvasTexture | undefined;
    let clonedFaceMaterial: MeshStandardMaterial | undefined;
    let originalFaceMaterial: MeshStandardMaterial | undefined;
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = 1024;
    faceCanvas.height = 1024;
    const faceContext = faceCanvas.getContext('2d', { alpha: true });
    if (!faceContext) {
      setLoadError('Não foi possível criar a superfície das expressões.');
      return;
    }

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
        premultipliedAlpha: true,
      });
    } catch {
      setLoadError('WebGL não está disponível nesta janela.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);

    const scene = new Scene();
    const camera = new OrthographicCamera(-1.375, 1.375, 1.375, -1.375, 0.01, 30);
    camera.position.set(0, 0, 4.8);
    camera.lookAt(0, 0, 0);
    scene.add(new AmbientLight(0xffedf0, 1.25));
    const keyLight = new DirectionalLight(0xfff2ec, 2.45);
    keyLight.position.set(-3, 3.6, 4.5);
    scene.add(keyLight);
    const fillLight = new DirectionalLight(0xff7775, 1.2);
    fillLight.position.set(3.4, 0.6, 1.8);
    scene.add(fillLight);
    const rimLight = new DirectionalLight(0xffffff, 1.5);
    rimLight.position.set(0.3, 2, -3.2);
    scene.add(rimLight);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const viewHeight = 2.75 / Math.max(0.72, settingsRef.current.cameraZoom);
      const aspect = width / height;
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let currentPose = getFacePose(settingsRef.current.expression);
    let fromPose = currentPose;
    let transitionStartedAt = performance.now();
    let lastExpression = settingsRef.current.expression;
    let lastFaceUpdate = 0;
    let previousFrame = performance.now();
    let frameCount = 0;
    let lastMetricsAt = previousFrame;
    let lastMotionId = -1;
    let activeMotion: { type: MascotMotion; startedAt: number } | undefined;

    const startRendering = () => {
      if (animationRunning || disposed || !ready) return;
      animationRunning = true;
      renderer.setAnimationLoop((now) => {
        if (!ready || disposed) return;
        const settings = settingsRef.current;
        previousFrame = now;
        frameCount += 1;

        if (settings.expression !== lastExpression) {
          fromPose = currentPose;
          lastExpression = settings.expression;
          transitionStartedAt = now;
        }
        if (settings.motionRequest && settings.motionRequest.id !== lastMotionId) {
          lastMotionId = settings.motionRequest.id;
          activeMotion = { type: settings.motionRequest.type, startedAt: now };
        }

        const transition = Math.min(1, (now - transitionStartedAt) / 260);
        const eased = transition * transition * (3 - 2 * transition);
        const targetPose = getFacePose(settings.expression);
        currentPose = interpolateFacePose(fromPose, targetPose, eased);
        if (now - lastFaceUpdate >= (settings.reduceMotion ? 250 : 34)) {
          const elapsed = now / 1000;
          const isWaking = settings.expression === 'waking' && now - transitionStartedAt < 900;
          const waking = isWaking ? Math.min(1, (now - transitionStartedAt) / 900) : 1;
          const faceMotion = evaluateMascotMotion(
            activeMotion ? (now - activeMotion.startedAt) / 1000 : elapsed,
            settings.expression,
            settings.reduceMotion || !settings.animationsEnabled,
            activeMotion?.type ?? motionForExpression(settings.expression),
            pointer,
          );
          const pose = isWaking
            ? { ...currentPose, openness: currentPose.openness * waking }
            : currentPose;
          drawProgrammaticFace(faceContext, pose, {
            blink: isWaking ? Math.max(0.02, waking) : faceMotion.blink,
            elapsedSeconds: elapsed,
            reduceMotion: settings.reduceMotion || !settings.animationsEnabled,
          });
          faceTexture!.needsUpdate = true;
          lastFaceUpdate = now;
        }

        const motionDuration = activeMotion ? (now - activeMotion.startedAt) / 1000 : 0;
        if (activeMotion && motionDuration > (activeMotion.type === 'dragging' ? 60 : 1.25)) {
          activeMotion = undefined;
        }
        const motionFrame = evaluateMascotMotion(
          activeMotion ? motionDuration : now / 1000,
          settings.expression,
          settings.reduceMotion || !settings.animationsEnabled,
          activeMotion?.type ?? motionForExpression(settings.expression),
          pointer,
        );
        if (modelResources) {
          modelResources.root.position.set(
            settings.modelOffset.x,
            settings.modelOffset.y + motionFrame.bob,
            0,
          );
          modelResources.root.rotation.set(
            motionFrame.rotationX,
            motionFrame.rotationY,
            motionFrame.rotationZ,
          );
          const scale =
            modelResources.root.userData.fitScale * settings.modelScale * motionFrame.scale;
          modelResources.root.scale.setScalar(scale);
        }

        camera.position.set(
          Math.sin((settings.cameraYaw * Math.PI) / 180) * 4.8,
          Math.sin((settings.cameraPitch * Math.PI) / 180) * 4.8,
          Math.cos((settings.cameraYaw * Math.PI) / 180) * 4.8,
        );
        camera.lookAt(0, 0, 0);
        keyLight.intensity = 2.45 * settings.lightIntensity;
        fillLight.intensity = 1.2 * settings.lightIntensity;
        rimLight.intensity = 1.5 * settings.lightIntensity;
        renderer.render(scene, camera);

        if (now - lastMetricsAt >= 1000) {
          settings.onMetrics?.({
            fps: Math.round((frameCount * 1000) / (now - lastMetricsAt)),
            triangles: renderer.info.render.triangles,
            drawCalls: renderer.info.render.calls,
          });
          frameCount = 0;
          lastMetricsAt = now;
        }
      });
    };
    const stopRendering = () => {
      if (!animationRunning) return;
      renderer.setAnimationLoop(null);
      animationRunning = false;
    };
    const syncVisibility = async () => {
      if (disposed) return;
      let visible = !document.hidden;
      if (visible && isTauri()) {
        try {
          visible = await getCurrentWindow().isVisible();
        } catch {
          visible = true;
        }
      }
      if (visible) startRendering();
      else stopRendering();
    };
    const onVisibilityChange = () => void syncVisibility();
    document.addEventListener('visibilitychange', onVisibilityChange);
    const visibilityTimer = window.setInterval(() => void syncVisibility(), 700);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      setLoadError('O contexto gráfico foi interrompido.');
      stopRendering();
    };
    const onContextRestored = () => {
      setLoadError('');
      startRendering();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    let pointer = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointer = {
        x: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)),
        y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)),
      };
      if (modelResources && activeMotion?.type === 'dragging') {
        modelResources.root.rotation.y = pointer.x * 0.12;
        modelResources.root.rotation.x = -pointer.y * 0.09;
      }
    };
    const onPointerLeave = () => {
      pointer = { x: 0, y: 0 };
    };
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);

    faceTexture = new CanvasTexture(faceCanvas);
    faceTexture.colorSpace = SRGBColorSpace;
    faceTexture.flipY = false;
    faceTexture.magFilter = LinearFilter;
    faceTexture.minFilter = LinearMipmapLinearFilter;
    faceTexture.generateMipmaps = true;

    void new GLTFLoader()
      .loadAsync(officialModelUrl)
      .then((gltf) => {
        if (disposed) {
          disposeScene(gltf.scene, [], faceTexture);
          return;
        }
        const root = new Group();
        root.name = 'odekraiRoot';
        const originalScene = gltf.scene;
        loadedScene = originalScene;
        root.add(originalScene);
        const bounds = new Box3().setFromObject(originalScene);
        if (bounds.isEmpty()) throw new Error('O modelo oficial não contém geometria visível.');
        const size = bounds.getSize(new Vector3());
        const center = bounds.getCenter(new Vector3());
        const fitScale = Math.min(2.48 / size.x, 1.76 / size.y);
        originalScene.position.sub(center);
        root.userData.fitScale = fitScale;
        const face = originalScene.getObjectByName('ADA_Face_Display');
        if (!face) throw new Error('A malha ADA_Face_Display não foi encontrada.');
        const faceMaterials = applyFaceTexture(originalScene, faceTexture!);
        clonedFaceMaterial = faceMaterials.cloned;
        originalFaceMaterial = faceMaterials.original;
        modelResources = {
          root,
          originalScene,
          clonedFaceMaterial,
          originalFaceMaterial,
        };
        scene.add(root);
        setLoadError('');
        setLoaded(true);
        ready = true;
        previousFrame = performance.now();
        void syncVisibility();
      })
      .catch((cause: unknown) => {
        if (loadedScene && !modelResources) disposeScene(loadedScene, [], faceTexture);
        const message = cause instanceof Error ? cause.message : 'Erro inesperado no GLB.';
        setLoadError(message);
      });

    return () => {
      disposed = true;
      ready = false;
      stopRendering();
      observer.disconnect();
      window.clearInterval(visibilityTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      if (modelResources) {
        disposeScene(
          modelResources.originalScene,
          [modelResources.clonedFaceMaterial, modelResources.originalFaceMaterial],
          faceTexture,
        );
      } else faceTexture?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={`odekrai-renderer ${loaded ? 'is-loaded' : 'is-fallback'} ${className}`.trim()}
      role="img"
      aria-label={
        loadError
          ? `Prévia do mascote indisponível: ${loadError}`
          : `Mascote ODEKRAI. Expressão: ${expression}.`
      }
      data-model-status={loaded ? 'loaded' : loadError ? 'fallback' : 'loading'}
      title={loadError || 'Mascote 3D oficial do ODEKRAI'}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <span className="odekrai-renderer-fallback" aria-hidden="true">
        O
      </span>
      {loadError && <span className="odekrai-renderer-status">{loadError}</span>}
    </div>
  );
}
