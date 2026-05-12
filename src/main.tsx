import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { logger } from './utils/logger';

logger.nav('Application starting', { version: import.meta.env.VITE_APP_VERSION });

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);

logger.perf('Application mounted', { timestamp: Date.now() });
