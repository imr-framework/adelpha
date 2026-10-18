import json
import xml.etree.ElementTree as ET
import pytest
from simulation.fem.fieldpreview import read_field_preview, write_field_preview, FIELDS


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


def test_write_field_preview_round_trips_without_reparsing_the_vtu(tmp_path):
    fixture_result(tmp_path)
    written = write_field_preview(tmp_path)
    path = tmp_path / 'field-preview.json'
    assert path.is_file()
    assert json.loads(path.read_text())['fields']['B']['values'] == written['fields']['B']['values']


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


def test_prefers_body_specific_fields_over_continuous_projection(tmp_path):
    path, root = fixture_result(tmp_path)
    for name, _ in FIELDS.values():
        ET.SubElement(root.find('.//PointData'), 'DataArray', Name=name + ' e',
                      NumberOfComponents='3', format='ascii').text = ' '.join(str(-i) for i in range(15))
    ET.ElementTree(root).write(path)
    data = read_field_preview(tmp_path)
    for field in data['fields'].values():
        assert field['values'] == [-i for i in range(15)]


@pytest.mark.parametrize('values,components', [('NaN ' * 15, '3'), ('0 ' * 12, '3'), ('0 ' * 15, '1')])
def test_corrupt_elemental_fields_do_not_fall_back_to_averaged_values(tmp_path, values, components):
    path, root = fixture_result(tmp_path)
    for name, _ in FIELDS.values():
        ET.SubElement(root.find('.//PointData'), 'DataArray', Name=name + ' e',
                      NumberOfComponents=components, format='ascii').text = values
    ET.ElementTree(root).write(path)
    with pytest.raises(ValueError):
        read_field_preview(tmp_path)


def test_rejects_partial_body_specific_field_set(tmp_path):
    path, root = fixture_result(tmp_path)
    ET.SubElement(root.find('.//PointData'), 'DataArray', Name='magnetic flux density e',
                  NumberOfComponents='3', format='ascii').text = '0 ' * 15
    ET.ElementTree(root).write(path)
    with pytest.raises(ValueError, match='Incomplete body-specific'):
        read_field_preview(tmp_path)
