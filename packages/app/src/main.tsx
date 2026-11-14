/** The browser entry point: connects to the server and draws the app. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { start } from './connection';
import './tokens.css';
import './styles.css';
import './ui/ui.css';

void start();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
