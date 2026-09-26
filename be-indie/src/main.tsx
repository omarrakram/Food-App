import { createRoot } from 'react-dom/client';
import './styles/fonts';
import './styles/global.css';
import { Showcase } from './showcase/Showcase';
import { Site } from './site/Site';
import { Lab } from './lab';

const path = location.pathname.replace(/\/+$/, '') || '/';
const View = path === '/showcase' ? Showcase : path === '/lab' ? Lab : Site;
createRoot(document.getElementById('root')!).render(<View />);
