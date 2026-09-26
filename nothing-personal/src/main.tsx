import { createRoot } from 'react-dom/client';
import '@fontsource-variable/archivo/standard.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
