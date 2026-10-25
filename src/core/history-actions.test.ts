import { describe, expect, it } from 'vitest';
import { canConfirmHistoryDeletion } from './history-actions';

describe('confirmação de exclusão do histórico', () => {
  it('exige digitar APAGAR na segunda etapa', () => {
    expect(canConfirmHistoryDeletion('')).toBe(false);
    expect(canConfirmHistoryDeletion('apagar')).toBe(false);
    expect(canConfirmHistoryDeletion(' APAGAR ')).toBe(true);
  });
});
