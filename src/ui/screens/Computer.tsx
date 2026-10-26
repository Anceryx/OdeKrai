import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
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
  useEffect(() => {
    if (!isTauri()) return;
    void invoke<HardwareProfile>('get_hardware_profile')
      .then(setHardware)
      .catch(() => setError('Não foi possível consultar o hardware deste computador.'));
  }, []);
  const recommendation = hardware ? recommendLocalModel(hardware) : null;

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
