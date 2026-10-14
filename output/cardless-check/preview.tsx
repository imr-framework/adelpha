import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/styles.css';
import '../../src/themes.css';
import {SensorWaiting} from '../../src/twin/dashboard/SensorWaiting';
document.documentElement.dataset.consoleTheme = new URLSearchParams(location.search).get('theme') || 'adelpha';
createRoot(document.getElementById('root')!).render(<div style={{display:'grid',gridTemplateColumns:'1fr 350px',height:'100vh'}}><div style={{position:'relative'}}><div className="liquid-dashboard sensor-dashboard"><SensorWaiting /></div></div><aside className="panel"><div className="panel-mode-bar"><button className="panel-mode-btn panel-mode-btn-active">Telemetry</button><button className="panel-mode-btn">Agents</button></div><SensorWaiting compact /></aside></div>);
