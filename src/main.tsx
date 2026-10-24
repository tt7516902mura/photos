import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { installDebugHook } from './debug';

installDebugHook();
createRoot(document.getElementById('root')!).render(<App />);
