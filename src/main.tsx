import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './theme.css';
import { aplicarTema, temaSalvo } from './ui/tema';

aplicarTema(temaSalvo());
if (!import.meta.env.VITE_DEMO && 'serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));

const Router = import.meta.env.VITE_DEMO ? MemoryRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Router><App /></Router></React.StrictMode>,
);
