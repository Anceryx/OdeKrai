import React from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { App } from './ui/App';
import { IslandWindow } from './ui/IslandWindow';
import { DesktopCharacter } from './ui/DesktopCharacter';
import '@fontsource-variable/manrope';
import '@fontsource/dm-mono/400.css';
import './ui/design-tokens.css';
import './ui/styles.css';

const label = isTauri() ? getCurrentWindow().label : 'main';
const view =
  label === 'island' ? <IslandWindow /> : label === 'mascot' ? <DesktopCharacter /> : <App />;

createRoot(document.getElementById('root')!).render(<React.StrictMode>{view}</React.StrictMode>);
