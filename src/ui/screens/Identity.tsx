import type { ComponentProps } from 'react';
import { AgentHome } from '../AgentHome';

export type IdentityScreenProps = ComponentProps<typeof AgentHome>;
export function IdentityScreen(props: IdentityScreenProps) {
  return <AgentHome {...props} />;
}
