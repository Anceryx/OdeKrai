import { useCallback, useState } from 'react';
import {
  persistPage,
  readLastPage,
  resolveNavigation,
  type AppRoute,
  type NavigationSnapshot,
} from '../../core/navigation';
import type { Section } from '../screens/types';

export function useNavigation() {
  const [current, setCurrent] = useState<NavigationSnapshot>(() => {
    const page = readLastPage();
    return { route: { page }, section: page };
  });
  const [history, setHistory] = useState<NavigationSnapshot[]>([]);

  const navigate = useCallback(
    (destination: Section | AppRoute) => {
      const next = resolveNavigation(destination);
      if (
        current.section === next.section &&
        current.route.settingsSection === next.route.settingsSection
      )
        return;
      setHistory((items) => [...items, current]);
      persistPage(next.route.page);
      setCurrent(next);
    },
    [current],
  );

  const back = useCallback(() => {
    const previous = history.at(-1);
    if (!previous) return;
    persistPage(previous.route.page);
    setCurrent(previous);
    setHistory(history.slice(0, -1));
  }, [history]);

  return { section: current.section, route: current.route, navigate, back };
}
