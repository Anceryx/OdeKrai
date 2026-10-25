import { useState } from 'react';
import { Button } from './DesignSystem';
import { canConfirmHistoryDeletion } from '../core/history-actions';

export function HistoryDeletionSettings({ onConfirm }: { onConfirm: () => Promise<boolean> }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [confirmation, setConfirmation] = useState('');
  const [working, setWorking] = useState(false);

  async function deleteHistory() {
    if (working || step !== 2 || !canConfirmHistoryDeletion(confirmation)) return;
    setWorking(true);
    try {
      if (await onConfirm()) {
        setStep(0);
        setConfirmation('');
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className="preference-row">
        <div>
          <strong>Apagar todo o histórico</strong>
          <span>Remove conversas e mensagens salvas neste dispositivo.</span>
        </div>
        <Button type="button" variant="danger" onClick={() => setStep(1)}>
          Apagar histórico
        </Button>
      </div>
      {step > 0 && (
        <div className="history-confirm-backdrop">
          <section
            className="history-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-confirm-title"
          >
            <h2 id="history-confirm-title">Apagar todo o histórico?</h2>
            {step === 1 ? (
              <>
                <p>
                  Esta ação apaga as conversas e mensagens deste dispositivo e não pode ser
                  desfeita.
                </p>
                <div className="history-confirm-actions">
                  <Button type="button" variant="ghost" onClick={() => setStep(0)}>
                    Cancelar
                  </Button>
                  <Button type="button" variant="danger" onClick={() => setStep(2)}>
                    Continuar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <label>
                  Para confirmar, digite <strong>APAGAR</strong>.
                  <input
                    autoFocus
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
                <div className="history-confirm-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setStep(0);
                      setConfirmation('');
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={working || !canConfirmHistoryDeletion(confirmation)}
                    onClick={() => void deleteHistory()}
                  >
                    Confirmar e apagar
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
