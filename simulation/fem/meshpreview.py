"""Compact surface triangulation of the actual tetrahedral mesh for the UI."""
import json
from pathlib import Path


def write_mesh_preview(gmsh, bodies, directory, triangle_limit=250_000):
    """Export body interfaces, including the exterior air boundary, in SI metres.

    This is a surface view, not a decimated replacement for the solver mesh.
    Very large previews are explicitly declined; the full mesh remains downloadable.
    """
    groups = []
    count = 0
    for body in bodies:
        surfaces = {abs(tag) for dim, tag in gmsh.model.getBoundary(
            [(3, tag) for tag in body['volumes']], combined=True) if dim == 2}
        triangles = []
        for surface in sorted(surfaces):
            types, _, nodes = gmsh.model.mesh.getElements(2, surface)
            for kind, connectivity in zip(types, nodes):
                if int(kind) != 2:
                    raise ValueError('Mesh preview expects linear triangular faces')
                count += len(connectivity) // 3
                if count > triangle_limit:
                    payload = {'available': False, 'reason': 'Mesh exceeds the interactive preview limit of 250,000 surface triangles. Download the full mesh to view it in Gmsh or ParaView.'}
                    return _write(directory, payload)
                triangles.extend(int(node) for node in connectivity)
        groups.append({'id': body['id'], 'name': body['name'], 'triangles': triangles})
    used = {node for group in groups for node in group['triangles']}
    tags, coordinates, _ = gmsh.model.mesh.getNodes()
    vertices, indices = [], {}
    for i, tag in enumerate(tags):
        tag = int(tag)
        if tag in used:
            indices[tag] = len(vertices) // 3
            vertices.extend(float(v) for v in coordinates[3*i:3*i+3])
    for group in groups:
        group['triangles'] = [indices[tag] for tag in group['triangles']]
    return _write(directory, {'available': True, 'units': 'm', 'vertices': vertices, 'groups': groups, 'triangles': count})


def _write(directory, payload):
    path = Path(directory) / 'mesh-preview.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, separators=(',', ':')))
    temporary.replace(path)
    return payload
