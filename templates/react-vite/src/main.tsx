import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

function App(){return <main><h1>Open Lovable</h1><p>Template React/Vite exportável e verificável.</p></main>}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
