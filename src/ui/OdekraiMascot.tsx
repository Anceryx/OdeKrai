import { lazy, Suspense, type ComponentProps } from 'react';

const Renderer = lazy(() =>
  import('./OdekraiCompanion').then((module) => ({ default: module.OdekraiCompanion })),
);

export type { MascotMetrics, MascotMotionRequest } from './OdekraiCompanion';
export type OdekraiMascotProps = ComponentProps<typeof Renderer>;

export function OdekraiMascot(props: OdekraiMascotProps) {
  return (
    <Suspense
      fallback={
        <span className="odekrai-renderer-fallback" aria-hidden="true">
          O
        </span>
      }
    >
      <Renderer {...props} />
    </Suspense>
  );
}
