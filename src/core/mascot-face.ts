import type { FacePose, FaceStyle } from './mascot';

export type FaceAnimation = {
  blink: number;
  elapsedSeconds: number;
  reduceMotion: boolean;
};

const FACE_CENTER_Y = 584;
const EYE_CENTERS = [318, 706] as const;

function traceEye(ctx: CanvasRenderingContext2D, style: FaceStyle) {
  if (style === 'smile' || style === 'sleep') {
    ctx.beginPath();
    ctx.moveTo(-100, 28);
    if (style === 'smile') {
      ctx.bezierCurveTo(-70, -80, 70, -80, 100, 28);
    } else {
      ctx.bezierCurveTo(-52, -24, 52, -24, 100, 28);
    }
    return;
  }

  ctx.beginPath();
  ctx.moveTo(-93, 28);
  ctx.bezierCurveTo(-96, -18, -62, -72, -12, -76);
  ctx.bezierCurveTo(37, -82, 87, -42, 93, 16);
  ctx.bezierCurveTo(97, 59, 56, 78, 20, 62);
  ctx.bezierCurveTo(-18, 88, -86, 72, -93, 28);
  ctx.closePath();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  pose: FacePose,
  open: number,
  tilt: number,
  gazeX: number,
  gazeY: number,
) {
  const eyeHeight = pose.style === 'narrow' ? 0.72 : pose.style === 'wide' ? 1.12 : 1;
  ctx.save();
  ctx.translate(centerX + gazeX * 17, centerY + gazeY * 12);
  ctx.rotate(tilt);
  ctx.scale(1, Math.max(0.025, open * eyeHeight));
  traceEye(ctx, pose.style);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = `rgba(255, 250, 245, ${0.5 + pose.glow * 0.45})`;
  ctx.shadowBlur = 28;
  ctx.strokeStyle = `rgba(255, 255, 252, ${0.84 + pose.glow * 0.16})`;
  ctx.lineWidth = pose.style === 'smile' || pose.style === 'sleep' ? 30 : 8;
  ctx.stroke();
  if (pose.style !== 'smile' && pose.style !== 'sleep') {
    const fill = ctx.createLinearGradient(0, -78, 0, 78);
    fill.addColorStop(0, '#ffffff');
    fill.addColorStop(0.62, '#fffdf8');
    fill.addColorStop(1, '#e9f2ff');
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.restore();
}

export function drawProgrammaticFace(
  context: CanvasRenderingContext2D,
  pose: FacePose,
  animation: FaceAnimation,
) {
  const { canvas } = context;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const elapsed = animation.reduceMotion ? 0 : animation.elapsedSeconds;
  const breathe =
    pose.style === 'narrow' && pose.openness < 0.7 ? 0.97 + Math.sin(elapsed * 2) * 0.03 : 1;
  const openness = pose.openness * animation.blink * breathe;
  drawEye(
    context,
    EYE_CENTERS[0],
    FACE_CENTER_Y,
    pose,
    pose.leftOpenness * openness,
    pose.leftTilt,
    pose.gazeX,
    pose.gazeY,
  );
  drawEye(
    context,
    EYE_CENTERS[1],
    FACE_CENTER_Y,
    pose,
    pose.rightOpenness * openness,
    pose.rightTilt,
    pose.gazeX,
    pose.gazeY,
  );

  if (pose.style === 'worried') {
    context.save();
    context.strokeStyle = `rgba(255, 255, 252, ${0.62 + pose.glow * 0.25})`;
    context.lineWidth = 13;
    context.lineCap = 'round';
    context.shadowColor = 'rgba(255, 255, 255, 0.42)';
    context.shadowBlur = 15;
    for (const [cx, direction] of [
      [318, 1],
      [706, -1],
    ] as const) {
      context.beginPath();
      context.moveTo(cx - 62, 465 + direction * 12);
      context.quadraticCurveTo(cx, 438, cx + 62, 465 - direction * 12);
      context.stroke();
    }
    context.restore();
  }

  if (pose.style === 'wide' && !animation.reduceMotion) {
    const pulse = 0.25 + (Math.sin(elapsed * 5) + 1) * 0.08;
    context.save();
    context.globalAlpha = pulse;
    context.strokeStyle = '#fffdf8';
    context.lineWidth = 7;
    context.lineCap = 'round';
    for (const cx of EYE_CENTERS) {
      context.beginPath();
      context.moveTo(cx, 442);
      context.lineTo(cx, 425);
      context.stroke();
    }
    context.restore();
  }

  if (pose.style === 'narrow' && !animation.reduceMotion && pose.glow < 0.74) {
    const rotation = elapsed * 1.25;
    context.save();
    context.translate(512, 584);
    context.rotate(rotation);
    context.strokeStyle = `rgba(255, 255, 255, ${0.3 + pose.glow * 0.24})`;
    context.lineWidth = 8;
    context.lineCap = 'round';
    context.beginPath();
    context.arc(0, 0, 132, 0.15, Math.PI * 0.92);
    context.stroke();
    context.restore();
  }

  if (pose.style === 'smile' && pose.glow > 0.95 && !animation.reduceMotion) {
    const pulse = 0.62 + (Math.sin(elapsed * 6) + 1) * 0.12;
    context.save();
    context.globalAlpha = pulse;
    context.strokeStyle = '#fffaf1';
    context.lineWidth = 7;
    context.lineCap = 'round';
    for (const [cx, sign] of [
      [207, -1],
      [817, 1],
    ] as const) {
      context.beginPath();
      context.moveTo(cx, 541);
      context.lineTo(cx + sign * 13, 526);
      context.stroke();
    }
    context.restore();
  }
}
