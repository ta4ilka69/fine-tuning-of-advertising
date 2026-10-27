import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import '@fontsource-variable/inter/wght.css';
import '../../src/app/styles.css';
import { SessionFixture } from './SessionFixture';
import { UIFixture } from './UIFixture';

createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('session') ? <SessionFixture /> : <UIFixture />);
