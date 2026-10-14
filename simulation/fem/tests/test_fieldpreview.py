import json
import xml.etree.ElementTree as ET
import pytest
from simulation.fem.fieldpreview import read_field_preview, FIELDS


def fixture_result(tmp_path):
    root = ET.Element('VTKFile')
    piece = ET.SubElement(root, 'Piece', NumberOfPoints='5', NumberOfCells='2')
    def add(parent, text, **attrs):
        ET.SubElement(parent, 'DataArray', format='ascii', **attrs).text = text
    points = ET.SubElement(piece, 'Points')
    add(points, '0 0 0 1 0 0 0 1 0 0 0 1 0 0 -1')
    fields = ET.SubElement(piece, 'PointData')
    for name, unit in FIELDS.values():
        add(fields, ' '.join(str(i) for i in range(15)), Name=name, NumberOfComponents='3')
    cells = ET.SubElement(piece, 'Cells')
    add(cells, '0 1 2 3 0 2 1 4', Name='connectivity')
    add(cells, '4 8', Name='offsets')
    add(cells, '10 10', Name='types')
    add(ET.SubElement(piece, 'CellData'), '2 2', Name='GeometryIds')
    (tmp_path / 'results').mkdir()
    path = tmp_path / 'results/fields.vtu'
    ET.ElementTree(root).write(path)
    (tmp_path / 'mesh.json').write_text(json.dumps({'bodies': [{'id': 2, 'name': 'magnet'}]}))
    return path, root


def test_surface_discards_internal_faces_and_retains_field_values(tmp_path):
    fixture_result(tmp_path)
    data = read_field_preview(tmp_path)
    assert data['fields']['B']['values'] == list(range(15))
    assert len(data['groups'][0]['triangles']) == 6 * 3
    assert data['fields']['H']['unit'] == 'A/m'
    assert len(data['groups'][0]['tetrahedra']) == 8


def test_rejects_corrupt_indices(tmp_path):
    path, root = fixture_result(tmp_path)
    root.find('.//Cells/DataArray[@Name="connectivity"]').text = '0 1 2 99 0 2 1 4'
    ET.ElementTree(root).write(path)
    with pytest.raises(ValueError, match='point index'):
        read_field_preview(tmp_path)


def test_refuses_binary_or_nonfinite_data(tmp_path):
    path, root = fixture_result(tmp_path)
    root.find('.//Points/DataArray').set('format', 'binary')
    ET.ElementTree(root).write(path)
    with pytest.raises(ValueError, match='unsupported'):
        read_field_preview(tmp_path)
