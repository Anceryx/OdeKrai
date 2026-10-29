export type IdleCue = 'blink' | 'gaze-left' | 'gaze-right';

export function canAnimateIdle(input: {
  enabled: boolean;
  visible: boolean;
  idle: boolean;
}): boolean {
  return input.enabled && input.visible && input.idle;
}

export function idleCueDelay(random: number): number {
  const normalized = Math.min(0.999999, Math.max(0, random));
  return 4500 + Math.floor(normalized * 4000);
}

export function idleCue(random: number): IdleCue {
  if (random < 0.58) return 'blink';
  return random < 0.79 ? 'gaze-left' : 'gaze-right';
}
