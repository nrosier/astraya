import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.js';
import { applyTheme, readStoredTheme } from './ui/theme-dom.js';
import './ui/app.css';

// Applied here, before React ever renders, so a stored light/dark override (#70) never
// flashes the OS-default theme first.
applyTheme(readStoredTheme());

// The advisor-voice preference (#429) no longer exists; a device that saved one carries a stale value.
try {
  localStorage.removeItem('astraya:reportPersona');
} catch {
  // Storage can be blocked (a private window); there is then nothing to clear.
}

const root = document.getElementById('root');
if (root === null) throw new Error('Missing #root element in index.html.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
