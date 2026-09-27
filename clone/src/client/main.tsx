// Mounts the sheet screen.

import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import './theme.css';

const rootEl = document.getElementById('root');
if (rootEl) createRoot(rootEl).render(<App />);
