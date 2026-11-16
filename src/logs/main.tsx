import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LogsPage } from './LogsPage';
import './logs.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LogsPage />
  </StrictMode>,
);
