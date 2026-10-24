import type { IslandState } from './island';

export const MASCOT_EXPRESSIONS = [
  'idle',
  'happy',
  'sad',
  'angry',
  'surprised',
  'confused',
  'thinking',
  'listening',
  'talking',
  'sleeping',
  'waking',
  'celebrating',
  'loading',
  'error',
  'working',
  'notification',
] as const;

export type MascotExpression = (typeof MASCOT_EXPRESSIONS)[number];
export type MascotMotion =
  | 'idle'
  | 'blink'
  | 'look-left'
  | 'look-right'
  | 'nod'
  | 'hover'
  | 'thinking'
  | 'listening'
  | 'talking'
  | 'sleep'
  | 'wake'
  | 'happy'
  | 'error'
  | 'dragging'
  | 'returning-home'
  | 'enter'
  | 'exit';

export const MASCOT_EXPRESSION_LABELS: Record<MascotExpression, string> = {
  idle: 'Disponível',
  happy: 'Feliz',
  sad: 'Triste',
  angry: 'Irritado',
  surprised: 'Surpreso',
  confused: 'Confuso',
  thinking: 'Pensando',
  listening: 'Atento',
  talking: 'Conversando',
  sleeping: 'Dormindo',
  waking: 'Acordando',
  celebrating: 'Comemorando',
  loading: 'Processando',
  error: 'Com preocupação',
  working: 'Concentrado',
  notification: 'Notificação',
};

export const MASCOT_MOTIONS: { id: MascotMotion; label: string }[] = [
  { id: 'blink', label: 'Piscar' },
  { id: 'look-left', label: 'Olhar à esquerda' },
  { id: 'look-right', label: 'Olhar à direita' },
  { id: 'hover', label: 'Seguir o ponteiro' },
  { id: 'dragging', label: 'Arrastar' },
  { id: 'nod', label: 'Confirmar' },
  { id: 'returning-home', label: 'Retornar à posição inicial' },
  { id: 'sleep', label: 'Dormir' },
  { id: 'wake', label: 'Acordar' },
  { id: 'happy', label: 'Pular de alegria' },
  { id: 'error', label: 'Reagir à falha' },
  { id: 'enter', label: 'Entrar' },
  { id: 'exit', label: 'Sair' },
];

export type FaceStyle = 'open' | 'smile' | 'sleep' | 'worried' | 'narrow' | 'wide';

export type FacePose = {
  style: FaceStyle;
  openness: number;
  leftOpenness: number;
  rightOpenness: number;
  leftTilt: number;
  rightTilt: number;
  gazeX: number;
  gazeY: number;
  glow: number;
};

const facePoses: Record<MascotExpression, FacePose> = {
  idle: {
    style: 'open',
    openness: 0.68,
    leftOpenness: 0.96,
    rightOpenness: 0.96,
    leftTilt: 0,
    rightTilt: 0,
    gazeX: 0,
    gazeY: 0,
    glow: 0.76,
  },
  happy: {
    style: 'smile',
    openness: 1,
    leftOpenness: 1,
    rightOpenness: 1,
    leftTilt: 0,
    rightTilt: 0,
    gazeX: 0,
    gazeY: 0,
    glow: 0.9,
  },
  sad: {
    style: 'worried',
    openness: 0.64,
    leftOpenness: 0.86,
    rightOpenness: 0.86,
    leftTilt: -0.18,
    rightTilt: 0.18,
    gazeX: 0,
    gazeY: 0.24,
    glow: 0.62,
  },
  angry: {
    style: 'narrow',
    openness: 0.66,
    leftOpenness: 0.76,
    rightOpenness: 0.76,
    leftTilt: 0.2,
    rightTilt: -0.2,
    gazeX: 0,
    gazeY: 0.04,
    glow: 0.82,
  },
  surprised: {
    style: 'wide',
    openness: 1,
    leftOpenness: 1.08,
    rightOpenness: 1.08,
    leftTilt: 0,
    rightTilt: 0,
    gazeX: 0,
    gazeY: -0.04,
    glow: 1,
  },
  confused: {
    style: 'open',
    openness: 0.82,
    leftOpenness: 0.6,
    rightOpenness: 0.98,
    leftTilt: -0.14,
    rightTilt: 0.08,
    gazeX: 0.3,
    gazeY: -0.12,
    glow: 0.78,
  },
  thinking: {
    style: 'narrow',
    openness: 0.72,
    leftOpenness: 0.8,
    rightOpenness: 0.8,
    leftTilt: -0.05,
    rightTilt: 0.05,
    gazeX: 0.48,
    gazeY: -0.18,
    glow: 0.76,
  },
  listening: {
    style: 'open',
    openness: 0.94,
    leftOpenness: 1,
    rightOpenness: 1,
    leftTilt: 0,
    rightTilt: 0,
    gazeX: 0,
    gazeY: 0,
    glow: 0.96,
  },
  talking: {
    style: 'open',
    openness: 0.9,
    leftOpenness: 0.92,
    rightOpenness: 0.92,
    leftTilt: 0,
    rightTilt: 0,
    gazeX: 0,
    gazeY: 0,
    glow: 0.88,
  },
  sleeping: {
    style: 'sleep',
    openness: 0.03,
    leftOpenness: 0.03,
    rightOpenness: 0.03,
    leftTilt: 0,
    rightTilt: 0,
    gazeX: 0,
    gazeY: 0,
    glow: 0.4,
  },
  waking: {
    style: 'open',
    openness: 0.02,
    leftOpenness: 0.04,
    rightOpenness: 0.04,
    leftTilt: 0,
    rightTilt: 0,
    gazeX: 0,
    gazeY: 0.1,
    glow: 0.76,
  },
  celebrating: {
    style: 'smile',
    openness: 1,
    leftOpenness: 1,
    rightOpenness: 1,
    leftTilt: -0.04,
    rightTilt: 0.04,
    gazeX: 0,
    gazeY: -0.04,
    glow: 1,
  },
  loading: {
    style: 'narrow',
    openness: 0.58,
    leftOpenness: 0.72,
    rightOpenness: 0.72,
    leftTilt: 0,
    rightTilt: 0,
    gazeX: 0,
    gazeY: 0.08,
    glow: 0.7,
  },
  error: {
    style: 'worried',
    openness: 0.62,
    leftOpenness: 0.8,
    rightOpenness: 0.8,
    leftTilt: 0.12,
    rightTilt: -0.12,
    gazeX: 0,
    gazeY: 0.12,
    glow: 0.78,
  },
  working: {
    style: 'narrow',
    openness: 0.54,
    leftOpenness: 0.78,
    rightOpenness: 0.78,
    leftTilt: 0.04,
    rightTilt: -0.04,
    gazeX: 0,
    gazeY: 0.08,
    glow: 0.72,
  },
  notification: {
    style: 'wide',
    openness: 0.92,
    leftOpenness: 0.96,
    rightOpenness: 0.96,
    leftTilt: 0,
    rightTilt: 0,
    gazeX: 0,
    gazeY: -0.06,
    glow: 0.92,
  },
};

export function getFacePose(expression: MascotExpression): FacePose {
  return { ...facePoses[expression] };
}

export function expressionForIslandState(state: IslandState): MascotExpression {
  switch (state) {
    case 'listening':
      return 'listening';
    case 'thinking':
      return 'thinking';
    case 'responding':
      return 'talking';
    case 'task':
      return 'working';
    case 'notification':
      return 'notification';
    case 'error':
      return 'error';
    case 'completed':
      return 'happy';
    case 'hidden':
      return 'sleeping';
    default:
      return 'idle';
  }
}

export function motionForExpression(expression: MascotExpression): MascotMotion {
  switch (expression) {
    case 'thinking':
      return 'thinking';
    case 'listening':
      return 'listening';
    case 'talking':
      return 'talking';
    case 'sleeping':
      return 'sleep';
    case 'waking':
      return 'wake';
    case 'celebrating':
    case 'happy':
      return 'happy';
    case 'error':
      return 'error';
    case 'notification':
      return 'hover';
    default:
      return 'idle';
  }
}

export type MotionFrame = {
  bob: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  gazeX: number;
  gazeY: number;
  blink: number;
};

export function evaluateMascotMotion(
  timeSeconds: number,
  expression: MascotExpression,
  reduceMotion = false,
  motion: MascotMotion = 'idle',
  pointer = { x: 0, y: 0 },
): MotionFrame {
  const t = Math.max(0, timeSeconds);
  const idle = {
    bob: Math.sin(t * 1.65) * 0.035,
    rotationX: Math.sin(t * 0.75) * 0.018,
    rotationY: Math.sin(t * 0.92) * 0.028,
    rotationZ: Math.sin(t * 0.58) * 0.012,
    scale: 1,
    gazeX: 0,
    gazeY: 0,
  };
  if (reduceMotion) {
    return {
      ...idle,
      bob: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      scale: 1,
      blink: expression === 'sleeping' ? 0 : 1,
    };
  }

  let frame = { ...idle };
  switch (motion) {
    case 'blink':
      break;
    case 'look-left':
      frame = { ...frame, rotationY: -0.15, gazeX: -0.8 };
      break;
    case 'look-right':
      frame = { ...frame, rotationY: 0.15, gazeX: 0.8 };
      break;
    case 'nod':
      frame = { ...frame, rotationX: Math.sin(t * 8) * 0.13 };
      break;
    case 'hover':
      frame = {
        ...frame,
        bob: Math.sin(t * 1.2) * 0.065,
        rotationX: -pointer.y * 0.035,
        rotationY: pointer.x * 0.06,
        gazeX: pointer.x * 0.42,
        gazeY: pointer.y * 0.28,
      };
      break;
    case 'thinking':
      frame = { ...frame, rotationZ: -0.045, gazeX: 0.48, gazeY: -0.16 };
      break;
    case 'listening':
      frame = { ...frame, rotationY: 0.035, gazeY: -0.02 };
      break;
    case 'talking':
      frame = { ...frame, bob: idle.bob + Math.sin(t * 7.5) * 0.012 };
      break;
    case 'sleep':
      frame = { ...frame, bob: Math.sin(t * 0.7) * 0.006, rotationY: 0 };
      break;
    case 'wake':
      frame = { ...frame, bob: Math.sin(t * 1.65) * 0.04, rotationX: -0.035 };
      break;
    case 'happy':
    case 'enter':
      frame = {
        ...frame,
        bob: Math.max(0, Math.sin(t * 7)) * 0.1,
        rotationZ: Math.sin(t * 7) * 0.035,
      };
      break;
    case 'error':
      frame = {
        ...frame,
        rotationZ: Math.sin(t * 12) * 0.045,
        scale: 1 + Math.sin(t * 12) * 0.015,
      };
      break;
    case 'dragging':
      frame = {
        ...frame,
        bob: 0,
        rotationY: pointer.x * 0.1,
        rotationX: -pointer.y * 0.08,
        gazeX: pointer.x,
        gazeY: pointer.y,
      };
      break;
    case 'returning-home':
      frame = { ...frame, bob: 0, scale: 1 - Math.min(1, t) * 0.12 };
      break;
    case 'exit':
      frame = { ...frame, bob: Math.min(1, t) * 0.08, scale: 1 - Math.min(1, t) * 0.16 };
      break;
  }

  if (expression === 'sleeping' || motion === 'sleep') return { ...frame, blink: 0 };
  if (motion === 'blink') {
    const progress = Math.min(1, t / 0.24);
    return { ...frame, blink: 1 - Math.sin(progress * Math.PI) * 0.97 };
  }
  const blinkCycle = t % 4.8;
  const blink = blinkCycle > 4.61 ? Math.sin(((blinkCycle - 4.61) / 0.19) * Math.PI) : 0;
  return { ...frame, blink: 1 - blink * 0.97 };
}

export function interpolateFacePose(from: FacePose, to: FacePose, amount: number): FacePose {
  const t = Math.max(0, Math.min(1, amount));
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    style: t < 0.5 ? from.style : to.style,
    openness: mix(from.openness, to.openness),
    leftOpenness: mix(from.leftOpenness, to.leftOpenness),
    rightOpenness: mix(from.rightOpenness, to.rightOpenness),
    leftTilt: mix(from.leftTilt, to.leftTilt),
    rightTilt: mix(from.rightTilt, to.rightTilt),
    gazeX: mix(from.gazeX, to.gazeX),
    gazeY: mix(from.gazeY, to.gazeY),
    glow: mix(from.glow, to.glow),
  };
}
