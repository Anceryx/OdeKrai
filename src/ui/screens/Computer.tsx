import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  LOCAL_MODELS,
  formatBytes,
  recommendLocalModel,
  type HardwareProfile,
  type LocalModelInventory,
} from '../../core/local-models';
import { Badge, Button, Card, PageHeader } from '../DesignSystem';
import { Icon } from '../Icon';

const gib = (bytes: number) => `${(bytes / 1_073_741_824).toFixed(1)} GB`;
const groups = [
  { profile: 'leve', title: 'Leve', accepts: ['ultraleve', 'leve'] },
  { profile: 'medio', title: 'Médio', accepts: ['medio'] },
  { profile: 'pesado', title: 'Pesado', accepts: ['pesado'] },
];

export function ComputerScreen({ embedded = false }: { embedded?: boolean }) {
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
  const [inventory, setInventory] = useState<LocalModelInventory[]>([]);
  const [inventoryError, setInventoryError] = useState('');
  async function refreshInventory(folder = modelFolder) {
    if (!isTauri() || !folder) {
      setInventory([]);
      return;
    }
    try {
      setInventory(
        await invoke<LocalModelInventory[]>('inspect_local_models', { destination: folder }),
      );
      setInventoryError('');
    } catch (error) {
      setInventory([]);
      setInventoryError(String(error));
    }
  }
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
  useEffect(() => {
    void refreshInventory();
  }, [modelFolder]);
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
    await refreshInventory(folder);
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
      await refreshInventory();
    } catch (error) {
      setDownloadError(String(error));
      setDownload(null);
      await refreshInventory();
    }
  }
  async function deleteModel(model: (typeof LOCAL_MODELS)[number]) {
    if (!modelFolder) return;
    await invoke('delete_local_model', { modelId: model.id, destination: modelFolder });
  }

  return (
    <div
      id="computer-resources"
      className={
        embedded ? 'settings-embedded-content local-model-page' : 'page subpage local-model-page'
      }
    >
      {!embedded && (
        <PageHeader
          eyebrow="IA LOCAL"
          title="Seu computador"
          subtitle="Confira os recursos disponíveis e escolha um modelo. A escolha é sua; nada será baixado automaticamente."
        />
      )}
      {error && (
        <div className="ui-banner ui-banner--warning" role="status">
          {error} Você ainda pode escolher um modelo manualmente; a execução e os requisitos mínimos
          não são verificados pelo aplicativo.
        </div>
      )}
      {hardware ? (
        <Card className="hardware-summary">
          <h2 className="hardware-summary-heading">
            <Icon name="harddrives" size={21} /> IA local · Recursos do computador
          </h2>
          <dl>
            <div>
              <dt>Memória RAM</dt>
              <dd>
                {hardware.total_ram_bytes > 0
                  ? `${gib(hardware.available_ram_bytes)} disponível de ${gib(hardware.total_ram_bytes)}`
                  : 'Não detectada'}
              </dd>
            </div>
            <div>
              <dt>Espaço livre para modelos</dt>
              <dd>
                {hardware.models_free_bytes > 0 ? gib(hardware.models_free_bytes) : 'Não detectado'}
              </dd>
            </div>
            <div>
              <dt>Núcleos de CPU</dt>
              <dd>{hardware.cpu_cores > 0 ? hardware.cpu_cores : 'Não detectado'}</dd>
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
                  : 'Nenhum adaptador com VRAM dedicada detectado'}
              </dd>
            </div>
          </dl>
          {hardware.warnings.length > 0 && (
            <div className="ui-banner ui-banner--warning" role="status">
              {hardware.warnings.join(' ')} Você ainda pode escolher um modelo manualmente.
            </div>
          )}
          {recommendation && <p className="recommendation-reason">{recommendation.reason}</p>}
        </Card>
      ) : !error ? (
        <p role="status">Consultando recursos do computador…</p>
      ) : null}
      <section className="model-choice-section">
        <h2>Escolher modelo</h2>
        <p role="note">
          Arquivos GGUF não são executados pelo OdeKrai. Para usá-los, instale e inicie um servidor
          local compatível por conta própria, carregue o modelo nele e conecte em Provedores &gt; IA
          local. A descoberta consulta somente 127.0.0.1 nas portas 11434 (Ollama) e 8080 (llama.cpp
          server); o aplicativo não instala nem inicia esses motores.
        </p>
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
        {inventoryError && (
          <div className="ui-banner ui-banner--warning" role="status">
            Inventário indisponível: {inventoryError}
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
                    {inventory.find((entry) => entry.modelId === model.id) && (
                      <>
                        <span>
                          Estado:{' '}
                          {
                            {
                              NAO_BAIXADO: 'Não baixado',
                              BAIXANDO: 'Baixando',
                              PARCIAL: 'Download parcial, disponível para retomada',
                              BAIXADO: 'Baixado, ainda não verificado',
                              VERIFICADO: 'Verificado por tamanho, SHA-256 e cabeçalho GGUF',
                              ERRO: 'Erro: arquivo não corresponde ao catálogo',
                            }[inventory.find((entry) => entry.modelId === model.id)!.status]
                          }
                        </span>
                        <span>Executor: GGUF sem executor integrado</span>
                        <span>RAM/VRAM estimada: não verificada</span>
                        <details>
                          <summary>Detalhes do arquivo</summary>
                          <span>
                            Nome: {inventory.find((entry) => entry.modelId === model.id)!.name}
                          </span>
                          <span>
                            Caminho: {inventory.find((entry) => entry.modelId === model.id)!.path}
                          </span>
                          <span>
                            Tamanho encontrado:{' '}
                            {formatBytes(
                              inventory.find((entry) => entry.modelId === model.id)!.sizeBytes,
                            )}
                          </span>
                        </details>
                      </>
                    )}
                    <span>Requisitos mínimos: não verificados</span>
                    <span>
                      Licença declarada do modelo base: {model.license ?? 'não verificada'}; licença
                      do repositório GGUF: não verificada.
                    </span>
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
