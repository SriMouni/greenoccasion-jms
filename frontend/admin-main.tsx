import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './lib/api-base.ts';
import AdminApp from './AdminApp.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
