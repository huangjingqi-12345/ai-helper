import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { logger } from './utils/logger';

const appVersion = import.meta.env.VITE_APP_VERSION || 'local-source';
const entrypoint = 'src/main.tsx';

document.documentElement.dataset.pxLiteRuntime = 'source-react';
document.documentElement.dataset.pxLiteEntrypoint = entrypoint;
document.documentElement.dataset.pxLiteVersion = appVersion;

logger.nav('Application starting from source entrypoint', {
  entrypoint,
  version: appVersion,
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);

logger.perf('Application mounted', { timestamp: Date.now() });
