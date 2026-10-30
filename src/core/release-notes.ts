export const RELEASE_NOTES_LAST_SEEN_KEY = 'odekrai:release-notes:last-seen';

export type ReleaseNote = {
  version: string;
  title: string;
  date: string;
  summary: string;
  changes: string[];
};

export type ReleasePromptDecision = {
  show: boolean;
  markSeen: boolean;
  reason: 'new-version' | 'same-version' | 'first-install' | 'disabled' | 'notes-missing';
};

export function decideReleasePrompt({
  currentVersion,
  previousVersion,
  notesAvailable,
  hasExistingPreferences,
  enabled,
}: {
  currentVersion: string;
  previousVersion: string | null;
  notesAvailable: boolean;
  hasExistingPreferences: boolean;
  enabled: boolean;
}): ReleasePromptDecision {
  if (!notesAvailable) return { show: false, markSeen: false, reason: 'notes-missing' };
  if (previousVersion === currentVersion) {
    return { show: false, markSeen: true, reason: 'same-version' };
  }
  if (!previousVersion && !hasExistingPreferences) {
    return { show: false, markSeen: true, reason: 'first-install' };
  }
  if (!enabled) return { show: false, markSeen: true, reason: 'disabled' };
  return { show: true, markSeen: true, reason: 'new-version' };
}
