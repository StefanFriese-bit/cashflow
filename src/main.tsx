import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { startSyncLoop } from './store';
import './styles.css';

try {
  const t = localStorage.getItem('cashflow-theme');
  if (t && t !== 'auto') document.documentElement.setAttribute('data-theme', t);
} catch {
  /* ignore */
}

render(<App />, document.getElementById('app')!);
startSyncLoop();
if ('serviceWorker' in navigator && !import.meta.env.DEV) registerSW({ immediate: true });
