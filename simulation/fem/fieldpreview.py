"""Read Elmer's ASCII VTU without merging discontinuous material interfaces."""
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

FIELDS = {'B': ('magnetic flux density', 'T'), 'H': ('magnetic field strength', 'A/m'),
          'A': ('magnetic vector potential', 'T·m')}


def read_field_preview(directory):
    directory = Path(directory)
    files = sorted((directory / 'results').glob('*.vtu'))
    if not files:
        raise ValueError('No field results found. Run the simulation first.')
    path = files[-1]
    if path.stat().st_size > 100 * 1024 * 1024:
        raise ValueError('Result exceeds the interactive viewer limit. Download the VTU for ParaView.')
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as exc:
        raise ValueError('The VTU result is incomplete or unreadable. Download the solver logs.') from exc
    pieces = root.findall('.//Piece')
    if len(pieces) != 1:
        raise ValueError('This result layout requires ParaView. Download the VTU file.')
    piece = pieces[0]
    count = int(piece.get('NumberOfPoints', '0'))
    cells = int(piece.get('NumberOfCells', '0'))
    if not 0 < count <= 200_000 or not 0 < cells <= 250_000:
        raise ValueError('Result exceeds the interactive viewer limit. Download the VTU for ParaView.')

    def array(node, length=None, integer=False):
        if node is None or node.get('format', node.get('FORMAT', 'ascii')).lower() != 'ascii':
            raise ValueError('Missing or unsupported VTU array')
        values = [int(v) if integer else float(v) for v in (node.text or '').split()]
        if length is not None and len(values) != length:
            raise ValueError('Incomplete VTU array')
        if not all(math.isfinite(v) for v in values):
            raise ValueError('Non-finite VTU array')
        return values

    points = array(piece.find('./Points/DataArray'), count * 3)
    fields = {}
    for symbol, (name, unit) in FIELDS.items():
        fields[symbol] = {'name': name, 'unit': unit,
                          'values': array(piece.find(f'./PointData/DataArray[@Name="{name}"]'), count * 3)}
    connectivity = array(piece.find('./Cells/DataArray[@Name="connectivity"]'), integer=True)
    offsets = array(piece.find('./Cells/DataArray[@Name="offsets"]'), cells, True)
    types = array(piece.find('./Cells/DataArray[@Name="types"]'), cells, True)
    bodies = array(piece.find('./CellData/DataArray[@Name="GeometryIds"]'), cells, True)
    manifest = json.loads((directory / 'mesh.json').read_text())
    groups = {b['id']: {'id': b['id'], 'name': b['name'], 'tetrahedra': [], 'triangles': []}
              for b in manifest['bodies']}
    faces = {i: {} for i in groups}
    start = 0
    for offset, kind, body in zip(offsets, types, bodies):
        if offset <= start or offset > len(connectivity):
            raise ValueError('Invalid VTU cell offsets')
        nodes = connectivity[start:offset]
        start = offset
        if any(i < 0 or i >= count for i in nodes):
            raise ValueError('Invalid VTU point index')
        if kind == 5:  # Boundary triangles are reconstructed from volume cells below.
            continue
        if kind != 10 or len(nodes) != 4 or body not in groups:
            raise ValueError('Unsupported volume elements. Download the VTU for ParaView.')
        groups[body]['tetrahedra'].extend(nodes)
        for a, b, c in ((0, 1, 2), (0, 3, 1), (1, 3, 2), (0, 2, 3)):
            face = tuple(sorted((nodes[a], nodes[b], nodes[c])))
            faces[body][face] = faces[body].get(face, 0) + 1
    if start != len(connectivity):
        raise ValueError('Incomplete VTU connectivity')
    for body, group in groups.items():
        group['triangles'] = [n for face, uses in faces[body].items() if uses == 1 for n in face]
        if not group['tetrahedra']:
            raise ValueError('Missing result body')
    return {'units': 'm', 'source': path.name, 'points': points, 'fields': fields,
            'groups': list(groups.values())}
