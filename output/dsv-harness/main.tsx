import React from 'react';
import {createRoot} from 'react-dom/client';
import FemFieldPreview from '../../src/twin/studio/FemFieldPreview';
import {applyConsoleTheme,CONSOLE_THEME_EVENT} from '../../src/twin/consoleTheme';
import '../../src/styles.css';
import '../../src/themes.css';
const fields=await (await fetch('/output/dsv-harness/fields.json')).json();
const original=window.fetch;window.fetch=async (...args)=>String(args[0]).endsWith('/fields')?new Response(JSON.stringify(fields),{headers:{'Content-Type':'application/json'}}):original(...args);
function App(){return <><div style={{height:40,display:'flex',gap:12,alignItems:'center',padding:'0 16px',color:'var(--m4-text)',background:'var(--m4-panel)'}}>DSV isolated test {['adelpha','mri4all','porcelain','glacier'].map(t=><button key={t} onClick={()=>{applyConsoleTheme(t as any);window.dispatchEvent(new CustomEvent(CONSOLE_THEME_EVENT,{detail:t}));}}>{t}</button>)}</div><div style={{position:'absolute',inset:'40px 0 0'}}><FemFieldPreview jobId="dsv-visual-fixture"/></div></>}
createRoot(document.getElementById('root')!).render(<App/>);
