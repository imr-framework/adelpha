from pathlib import Path
from html import escape
out=Path(__file__).parent
s=['''<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1080" viewBox="0 0 1600 1080" role="img" aria-labelledby="title desc"><title id="title">Adelpha Engineering Studio architecture</title><desc id="desc">The React studio interface exchanges study inputs and results with a local Python runtime. Engineering modules support magnet studies, gradient coils, passive shimming and MRzero sequence simulation. Project metadata and CAD are stored locally. Optional ADK agents provide AI assistance.</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#627789"/></marker></defs><rect width="1600" height="1080" fill="#f8fafb"/>''']
def rect(x,y,w,h,fill='#fff',stroke='#d9e2e9',r=18,dash=''):
 s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"'+(f' stroke-dasharray="{dash}"' if dash else '')+'/>')
def text(x,y,t,size=20,color='#182f42',weight=400):
 s.append(f'<text x="{x}" y="{y}" font-family="Arial, Helvetica, sans-serif" font-size="{size}" font-weight="{weight}" fill="{color}">{escape(t)}</text>')
def line(d,bi=False,dash=False):
 s.append(f'<path d="{d}" fill="none" stroke="#627789" stroke-width="2" marker-end="url(#arrow)"'+(' marker-start="url(#arrow)"' if bi else '')+(' stroke-dasharray="7 6"' if dash else '')+'/>')
text(64,62,'ADELPHA  /  SYSTEM ARCHITECTURE',15,'#526d81',700)
text(64,118,'Engineering Studio',42,weight=700)
text(64,156,'A unified workspace to design, simulate, and refine MRI systems.',22,'#536879')
rect(64,199,1472,570,'#f0f4f7','#dbe4ea',24)
text(90,235,'LOCAL DESKTOP APPLICATION',14,'#526d81',700)
# client
rect(88,263,400,474)
text(114,303,'Studio interface',26,weight=700)
text(114,333,'React + TypeScript · 3D visualization',17,'#5a6f80')
for y,title,detail in [(361,'Projects & examples','Create, organize, and reopen studies'),(462,'CAD & study setup','Geometry, materials, and parameters'),(563,'Results & inspection','Fields, coil layouts, and images')]:
 rect(110,y,356,83,'#f2f7fb','#e1eaf0',12)
 text(130,y+31,title,21,weight=700); text(130,y+58,detail,16,'#566e80')
text(114,704,'Engineer configures and reviews each study',16,'#5a6f80')
# runtime
rect(746,263,766,474)
text(772,303,'Local Python runtime',26,weight=700)
text(772,333,'Supervised services · FastAPI',17,'#5a6f80')
rect(772,366,178,308,'#edf5f6','#c9dde0',14)
text(794,411,'Local API',24,weight=700)
text(794,449,'Session-token',17,'#506b76'); text(794,474,'authentication',17,'#506b76')
text(794,528,'Routes study',17,'#506b76'); text(794,553,'requests to',17,'#506b76'); text(794,578,'Python modules',17,'#506b76')
text(794,644,'HTTP / JSON',15,'#506b76',700)
# modules
for y,title,detail in [(366,'Magnet & assembly studies','Field calculations · optional Elmer FEM'),(447,'Gradient coil design','pyCoilGen winding optimization'),(528,'Passive shimming','Field-map analysis and shim layouts'),(609,'Sequence simulation','MRzero through the MRI console API')]:
 rect(1012,y,474,65,'#f4f8f5','#dae7dd',11)
 text(1032,y+26,title,20,weight=700); text(1032,y+49,detail,16,'#526f60')
# internal routing bus
s.append('<path d="M950 520 H979 M979 398 V641" stroke="#627789" stroke-width="2" fill="none"/>')
for y in [398,479,560,641]: line(f'M979 {y} H1012')
# exchange main
line('M488 493 H772',True)
text(517,451,'Study inputs',18,'#425e74',700)
text(517,474,'Geometry + parameters',15,'#647988')
text(517,527,'Simulation results',18,'#425e74',700)
text(517,551,'Fields + layouts + images',15,'#647988')
text(910,708,'Shared local runtime',16,'#5a6f80')
# storage and assistance
line('M288 737 V828',True)
text(307,801,'Save / load',16,'#536c80')
rect(88,828,400,152,'#fff','#d9e2e9',16)
text(114,864,'Local project data',22,weight=700)
text(114,900,'Project metadata & settings · localStorage',16,'#5a6f80')
text(114,929,'Imported CAD assets · IndexedDB',16,'#5a6f80')
text(114,957,'Stored on the user’s machine',15,'#728390')
# optional agent call via same API
line('M861 674 V828',False,True)
rect(746,828,766,152,'#faf8fd','#c9bddc',16,'7 5')
text(772,864,'AI assistance',22,weight=700)
text(1335,864,'OPTIONAL',14,'#78658b',700)
text(772,901,'Studio chat → local agent API → Google ADK agents',19,'#5e526e')
text(772,933,'Model-backed help for engineering questions and design proposals.',17,'#756982')
text(772,958,'Requires agent service configuration and model access.',15,'#756982')
text(64,1033,'Simplified component view · Based on the current Adelpha implementation',16,'#687e8e')
text(1130,1033,'Dashed = optional capability',16,'#687e8e')
s.append('</svg>')
(out/'adelpha-engineering-studio.svg').write_text('\n'.join(s))
