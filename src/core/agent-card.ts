export type AgentCardState =
  | 'planejada'
  | 'aguardando aprovação'
  | 'executando'
  | 'concluída'
  | 'negada'
  | 'expirada'
  | 'erro';

export function getAgentCardState(action: { status: string }): AgentCardState {
  const status = action.status.toLocaleLowerCase('pt-BR');
  if (status.includes('aprova')) return 'aguardando aprovação';
  if (status.includes('execut')) return 'executando';
  if (status.includes('expir')) return 'expirada';
  if (status.includes('negad') || status.includes('bloquead')) return 'negada';
  if (status.includes('conclu')) return 'concluída';
  if (status.includes('falh') || status.includes('erro') || status.includes('interromp'))
    return 'erro';
  return 'planejada';
}

const BLOCKED_ARTIFACT_EXTENSIONS = new Set([
  'exe',
  'com',
  'bat',
  'cmd',
  'ps1',
  'psm1',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'msi',
  'msp',
  'scr',
  'dll',
  'sys',
  'lnk',
  'appx',
  'msix',
  'url',
  'html',
  'htm',
  'xhtml',
  'svg',
  'mht',
  'mhtml',
  'dotm',
  'xlsm',
  'xltm',
  'xlam',
  'pptm',
  'ppam',
]);

export function isSafeArtifactPath(path: string): boolean {
  if (!path || path.length > 32_767 || /[\u0000-\u001f]/.test(path)) return false;
  const normalized = path.replaceAll('\\', '/');
  if (normalized.split('/').includes('..')) return false;
  const extension = normalized.split('/').at(-1)?.split('.').at(-1)?.toLowerCase();
  return !extension || !BLOCKED_ARTIFACT_EXTENSIONS.has(extension);
}

export function formatRemainingApprovalTime(
  expiresAt?: number | null,
  now = Date.now(),
): string | null {
  if (!expiresAt) return null;
  const seconds = Math.max(0, Math.ceil((expiresAt * 1000 - now) / 1000));
  return seconds
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} restantes`
    : 'Prazo expirado';
}
