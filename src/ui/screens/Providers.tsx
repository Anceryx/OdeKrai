import type { ComponentProps } from 'react';
import { ProviderCatalog } from '../ProviderCatalog';

export type ProvidersScreenProps = ComponentProps<typeof ProviderCatalog>;
export function ProvidersScreen(props: ProvidersScreenProps) {
  return <ProviderCatalog {...props} />;
}
