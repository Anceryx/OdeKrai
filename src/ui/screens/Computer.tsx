import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  LOCAL_MODELS,
  formatBytes,
  recommendLocalModel,
  type HardwareProfile,
} from '../../core/local-models';
import { Badge, Button, Card, PageHeader } from '../DesignSystem';

const gib = (bytes: number) => `${(bytes / 1_073_741_824).toFixed(1)} GB`;
const groups = [
  { profile: 'leve', title: 'Leve', accepts: ['ultraleve', 'leve'] },
  { profile: 'medio', title: 'Médio', accepts: ['medio'] },
  { profile: 'pesado', title: 'Pesado', accepts: ['pesado'] },
];

export function ComputerScreen() {
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [modelFolder, setModelFolder] = useState(localStorage.getItem('odekrai.modelFolder') ?? '');
  const [download, setDownload] = useState<{
    modelId: string;
    receivedBytes: number;
    totalBytes: number;
  } | null>(null);
  const [downloadError, setDownloadError] = useState('');
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen<{ modelId: string; receivedBytes: number; totalBytes: number }>(
      'local-model-download-progress',
      (event) => setDownload(event.payload),
    ).then((dispose) => (unlisten = dispose));
    return () => unlisten?.();
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    void invoke<HardwareProfile>('get_hardware_profile')
      .then(setHardware)
      .catch(() => setError('Não foi possível consultar o hardware deste computador.'));
  }, []);
  const recommendation = hardware ? recommendLocalModel(hardware) : null;
  async function chooseModelFolder() {
    const folder = await open({
      directory: true,
      multiple: false,
      title: 'Escolha a pasta dos modelos',
    });
    if (typeof folder !== 'string') return;
    setModelFolder(folder);
    localStorage.setItem('odekrai.modelFolder', folder);
  }
  async function downloadModel(model: (typeof LOCAL_MODELS)[number]) {
    if (!modelFolder) {
      setDownloadError('Escolha a pasta de destino antes de baixar.');
      return;
    }
    setDownloadError('');
    setDownload({ modelId: model.id, receivedBytes: 0, totalBytes: model.sizeBytes ?? 0 });
    try {
      await invoke('download_local_model', {
        modelId: model.id,
        destination: modelFolder,
      });
      setDownload(null);
    } catch (error) {
      setDownloadError(String(error));
      setDownload(null);
    }
  }
  async function deleteModel(model: (typeof LOCAL_MODELS)[number]) {
    if (!modelFolder) return;
    await invoke('delete_local_model', { modelId: model.id, destination: modelFolder });
  }

  return (
    <div className="page subpage local-model-page">
      <PageHeader
        eyebrow="IA LOCAL"
        title="Seu computador"
        subtitle="Confira os recursos disponíveis e escolha um modelo. A escolha é sua; nada será baixado automaticamente."
      />
      {error && (
        <div className="ui-banner ui-banner--warning" role="status">
          {error}
        </div>
      )}
      {hardware ? (
        <Card className="hardware-summary">
          <h2>Recursos do computador</h2>
          <dl>
            <div>
              <dt>Memória RAM</dt>
              <dd>
                {gib(hardware.available_ram_bytes)} disponível de {gib(hardware.total_ram_bytes)}
              </dd>
            </div>
            <div>
              <dt>Espaço livre para modelos</dt>
              <dd>{gib(hardware.models_free_bytes)}</dd>
            </div>
            <div>
              <dt>Núcleos de CPU</dt>
              <dd>{hardware.cpu_cores}</dd>
            </div>
            <div>
              <dt>CPU</dt>
              <dd>
                AVX {hardware.avx ? 'sim' : 'não'} · AVX2 {hardware.avx2 ? 'sim' : 'não'} · AVX-512{' '}
                {hardware.avx512 ? 'sim' : 'não'}
              </dd>
            </div>
            <div className="hardware-gpus">
              <dt>Adaptadores de vídeo</dt>
              <dd>
                {hardware.adapters.length
                  ? hardware.adapters
                      .map(
                        (adapter) =>
                          `${adapter.name} (${gib(adapter.dedicated_vram_bytes)} VRAM dedicada)`,
                      )
                      .join('; ')
                  : 'Nenhum adaptador detectado'}
              </dd>
            </div>
          </dl>
          {recommendation && <p className="recommendation-reason">{recommendation.reason}</p>}
        </Card>
      ) : !error ? (
        <p role="status">Consultando recursos do computador…</p>
      ) : null}
      <section className="model-choice-section">
        <h2>Escolher modelo</h2>
        <div className="ui-actions">
          <Button variant="secondary" onClick={() => void chooseModelFolder()}>
            Escolher pasta dos modelos
          </Button>
          {modelFolder && (
            <span>
              Destino: {modelFolder}
              {/OneDrive/i.test(modelFolder)
                ? ' · Esta pasta parece sincronizada pelo OneDrive.'
                : ''}
            </span>
          )}
        </div>
        {download && (
          <p role="status">
            Baixando:{' '}
            {((download.receivedBytes / Math.max(download.totalBytes, 1)) * 100).toFixed(1)}%
          </p>
        )}
        {download && (
          <Button
            variant="secondary"
            onClick={() =>
              void invoke('cancel_local_model_download', { modelId: download.modelId })
            }
          >
            Cancelar download
          </Button>
        )}
        {downloadError && (
          <div className="ui-banner ui-banner--warning" role="alert">
            {downloadError}
          </div>
        )}
        <div className="local-model-cards">
          {groups.map((group) => {
            const entries = LOCAL_MODELS.filter((model) => group.accepts.includes(model.profile));
            const recommended =
              recommendation?.profile === group.profile ||
              (group.profile === 'leve' && recommendation?.profile === 'ultraleve');
            return (
              <Card className="local-model-card" key={group.profile}>
                <div className="local-model-card-heading">
                  <h3>{group.title}</h3>
                  {recommended && <Badge tone="success">Recomendado para o seu computador</Badge>}
                </div>
                {entries.map((model) => (
                  <div className="local-model-option" key={model.id}>
                    <strong>{model.name}</strong>
                    <span>Tamanho: {formatBytes(model.sizeBytes)}</span>
                    <span>Requisitos mínimos: não verificados</span>
                    <span>Licença: {model.license ?? 'não verificada'}</span>
                    <span>Thinking: {model.thinkingNotes}</span>
                    <Button
                      variant={selected === model.id ? 'primary' : 'secondary'}
                      onClick={() => setSelected(model.id)}
                    >
                      {selected === model.id ? 'Selecionado' : 'Escolher este modelo'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void downloadModel(model)}
                      disabled={!isTauri() || !model.sizeBytes || !model.sha256 || !model.license}
                    >
                      Baixar modelo
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void deleteModel(model)}
                      disabled={!isTauri() || !modelFolder}
                    >
                      Apagar modelo
                    </Button>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
        {selected && (
          <p role="status">
            Modelo escolhido: {LOCAL_MODELS.find((model) => model.id === selected)?.name}. A seleção
            não inicia downloads nem execução.
          </p>
        )}
        <p className="model-catalog-note">
          Os tamanhos e hashes correspondem aos arquivos publicados no Hugging Face. Requisitos de
          hardware e contexto ainda não foram verificados.
        </p>
      </section>
    </div>
  );
}
