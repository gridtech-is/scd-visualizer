import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { setupSwRefresh } from './pwa/swRefresh';

setupSwRefresh(navigator.serviceWorker, () => window.location.reload());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
