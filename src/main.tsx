import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
import { AMBIENTE_DE_PRUEBAS } from './lib/firebase'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Fuera de la base de datos real se avisa siempre, para no confundir un ensayo con datos verdaderos.
if (AMBIENTE_DE_PRUEBAS) {
  document.title = `[PRUEBAS] ${document.title}`;
  const aviso = document.createElement('div');
  aviso.textContent = 'AMBIENTE DE PRUEBAS — estos datos no son los reales';
  aviso.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#b45309;color:#fff;font:700 12px system-ui;text-align:center;padding:4px;pointer-events:none';
  document.body.appendChild(aviso);
}

// Aplicación instalable y usable sin señal (solo en la versión publicada: en desarrollo interferiría con la recarga).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(err => console.warn('No se pudo registrar el modo sin conexión:', err));
  });
}
