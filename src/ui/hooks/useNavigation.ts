import { useCallback, useState } from 'react';
import {
  persistPage,
  persistSettingsSection,
  readLastPage,
  readLastSettingsSection,
  resolveLegacySettingsNavigation,
  resolveNavigation,
  type AppRoute,
  type NavigationView,
  type SettingsSection,
} from '../../core/navigation';
import type { Section } from '../screens/types';

export function useNavigation() {
  const [current, setCurrent] = useState<NavigationView>(() => {
    const page = readLastPage();
    return {
      route: { page, settingsSection: readLastSettingsSection() },
      section: page,
      settingsOpen: false,
    };
  });
  const [history, setHistory] = useState<NavigationView[]>([]);

  const navigate = useCallback(
    (destination: Section | AppRoute) => {
      if (typeof destination === 'string') {
        const settingsNavigation = resolveLegacySettingsNavigation(destination, current);
        if (settingsNavigation) {
          setHistory((items) => [...items, current]);
          persistSettingsSection(settingsNavigation.route.settingsSection!);
          setCurrent(settingsNavigation);
          return;
        }
      }
      const next = resolveNavigation(destination);
      const nextView: NavigationView = { ...next, settingsOpen: false };
      if (current.section === nextView.section && !current.settingsOpen) return;
      setHistory((items) => [...items, current]);
      persistPage(next.route.page);
      setCurrent(nextView);
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

  const closeSettings = useCallback(() => {
    setCurrent((previous) => ({ ...previous, settingsOpen: false }));
  }, []);

  const selectSettingsSection = useCallback((section: SettingsSection) => {
    persistSettingsSection(section);
    setCurrent((previous) => ({
      ...previous,
      route: { ...previous.route, settingsSection: section },
      settingsOpen: true,
    }));
  }, []);

  return {
    section: current.section,
    route: current.route,
    settingsOpen: current.settingsOpen,
    closeSettings,
    selectSettingsSection,
    navigate,
    back,
  };
}
