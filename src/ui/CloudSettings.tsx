const CLOUD_SERVICES = {
  brazilian: [
    { name: 'Magalu Cloud', url: 'https://magalu.cloud/' },
    { name: 'Locaweb', url: 'https://www.locaweb.com.br/cloud/' },
    { name: 'UOL Host', url: 'https://uolhost.uol.com.br/cloud-computing' },
  ],
  international: [
    { name: 'Amazon Web Services', url: 'https://aws.amazon.com/' },
    { name: 'Google Cloud', url: 'https://cloud.google.com/' },
    { name: 'Microsoft Azure', url: 'https://azure.microsoft.com/' },
    { name: 'Oracle Cloud', url: 'https://www.oracle.com/cloud/' },
  ],
} as const;

export function CloudSettings() {
  return (
    <div className="settings-panel settings-section cloud-settings">
      <h2 id="cloud-settings-heading">Nuvem</h2>
      <p>
        A execução na nuvem ainda não está disponível. Nesta versão, nenhuma conta de serviço em
        nuvem é conectada ao OdeKrai.
      </p>
      <p className="cloud-settings-notice">
        Quando essa opção existir, cada ação remota exigirá aprovação e terá limites de gasto.
      </p>
      <CloudProviderList title="Nuvens brasileiras" services={CLOUD_SERVICES.brazilian} />
      <CloudProviderList title="Nuvens internacionais" services={CLOUD_SERVICES.international} />
    </div>
  );
}

function CloudProviderList({
  title,
  services,
}: {
  title: string;
  services: readonly { name: string; url: string }[];
}) {
  return (
    <section className="cloud-provider-list" aria-label={title}>
      <h3>{title}</h3>
      <ul>
        {services.map((service) => (
          <li key={service.name}>
            <a href={service.url} target="_blank" rel="noreferrer">
              {service.name}
            </a>
            <span className="cloud-planned-label">Planejado</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
