import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import '@fontsource-variable/inter/wght.css';
import { App } from './app/App';
import './app/styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Не найден корневой элемент приложения');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
