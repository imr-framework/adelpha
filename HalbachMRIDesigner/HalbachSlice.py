import numpy as np
import re
import solid
import gmsh

def arc( height, depth, radius, degrees ):
    retVal = solid.render()(
            solid.difference()(
            # Outer ring
            solid.rotate_extrude(segments = 100)(
                solid.translate([radius - height, 0, 0])(
                    solid.square([height,depth])
                )
            ),
            # Cut half off
            solid.translate([0,-(radius+1),-.5]) (
                solid.cube([radius+1,(radius+1)*2,depth+1])
            ),
            # Cover the other half as necessary
            solid.rotate([0,0,180-degrees])(
                solid.translate([0,-(radius+1),-.5]) (
                    solid.cube ([radius+1,(radius+1)*2,depth+1])
                )
            )
        )
    )
    return retVal

class HalbachSlice:
    def __init__(self, position, innerRadius, outerRadius, numConnectionRods, connectionRodsArcRadius,
        connectionRodsDiameter, standHeight = 0, standWidth = 0):
        self.position = position
        self.innerRadius = innerRadius
        self.outerRadius = outerRadius
        self.standHeight = standHeight
        self.standWidth = standWidth
        self.numConnectionRods = numConnectionRods
        self.connectionRodDiameter = connectionRodsDiameter
        self.shimTrayHeight = 0.014
        self.shimTrayAngle = 25
        self.shimTrayRadius = self.outerRadius*1e3 - 10
        self.rodRadius = connectionRodsArcRadius*1e3
        self.rings = []
        self.id = 0

    def setParams(self, params):
        self.params = params

    def setId(self, id):
        self.id = id

    def addRing(self, ring, position):
        ring.setPosition(position)
        self.rings.append(ring)

    def setPosition(self, position):
        self.position = position
        for ring in self.rings:
            ring.setPosition(position)

    def generateSCADObject(self):
        shimTray = arc(16,2000,self.shimTrayRadius,self.shimTrayAngle)
        stand = solid.linear_extrude(height = 12, center = True)(
            solid.polygon(points = [
                [-self.standWidth/2*1e3,-self.standHeight*1e3],
                [self.standWidth/2*1e3,-self.standHeight*1e3],
                [self.outerRadius*1e3,0],
                [-self.outerRadius*1e3,0]])
        )
        disc = solid.translate([0, 0, self.position*1e3])(
            stand + solid.cylinder(h=12, d=self.outerRadius*2*1e3, center=True) 
            - solid.cylinder(h=13, d=self.innerRadius*2*1e3, center=True)
            )
        cubes = []
        for ring in self.rings:
            for magnet in ring.magnets:
                cubes.append(solid.translate([magnet.position[0]*1e3, magnet.position[1]*1e3,
                    (magnet.position[2] + ring.position)*1e3])(
                    solid.rotate([0, 0, magnet.angle*180/np.pi])(
                        solid.cube([magnet.magnetType.dimension*1e3, magnet.magnetType.dimension*1e3,
                            magnet.magnetType.dimension*1e3+2], center=True)
                    )
                ))
        rods = []
        for n in np.arange(self.numConnectionRods):
            rods.append(
                solid.rotate([0, 0, 360/self.numConnectionRods*n + 360/self.numConnectionRods*0.5])(
                    solid.translate([self.rodRadius, 0, 0])(
                        solid.cylinder(h=2000, d=self.connectionRodDiameter*1e3, center=True)
                    )
                ))
        shimTrays = []
        for n in np.arange(self.numConnectionRods):
            shimTrays.append(
                solid.translate([0,0,-1000])(
                    solid.rotate([0, 0, 360/self.numConnectionRods*n + self.shimTrayAngle/2])(
                        shimTray
                    )
                ))
        addSCAD = []
        if 'addSCAD' in self.params['slices'][self.id]:
            addSCAD.append(
                solid.translate([0,0,self.position*1e3])(solid.code(self.params['slices'][self.id]['addSCAD'])))
        subSCAD = []
        if 'subSCAD' in self.params['slices'][self.id]:
            addSCAD.append(
                solid.translate([0,0,self.position*1e3])(solid.code(self.params['slices'][self.id]['subSCAD'])))
        return disc - cubes - rods - shimTrays + addSCAD - subSCAD

    def generateSCADFile(self, filename):
        solid.scad_render_to_file(self.generateSCADObject(), filename, include_orig_code=False)

    def generateOCCVolume(self):
        """Build this slice as an OpenCASCADE solid in millimetres. Returns volume dim-tags."""
        slice_height = 12.0
        z_mm = self.position * 1e3
        outer_r = self.outerRadius * 1e3
        inner_r = self.innerRadius * 1e3

        outer = gmsh.model.occ.addCylinder(0, 0, z_mm - slice_height / 2, 0, 0, slice_height, outer_r)
        body = [(3, outer)]
        if self.standWidth > 0 and self.standHeight > 0:
            stand = self._occ_stand(z_mm, slice_height)
            body, _ = gmsh.model.occ.fuse(body, [(3, stand)])

        add_tags = self._occ_custom_scad('addSCAD')
        if add_tags:
            body, _ = gmsh.model.occ.fuse(body, add_tags)

        tools = [(3, gmsh.model.occ.addCylinder(
            0, 0, z_mm - (slice_height + 1) / 2, 0, 0, slice_height + 1, inner_r))]
        tools.extend(self._occ_magnet_pockets())
        tools.extend(self._occ_rods())
        tools.extend(self._occ_shim_trays())
        tools.extend(self._occ_custom_scad('subSCAD'))

        cut_result, _ = gmsh.model.occ.cut(body, tools, removeObject=True, removeTool=True)
        return [dt for dt in cut_result if dt[0] == 3]

    def _occ_stand(self, z_mm, slice_height):
        width = self.standWidth * 1e3
        height = self.standHeight * 1e3
        outer_r = self.outerRadius * 1e3
        z0 = z_mm - slice_height / 2
        points_xy = [
            (-width / 2, -height),
            (width / 2, -height),
            (outer_r, 0),
            (-outer_r, 0),
        ]
        point_tags = [gmsh.model.occ.addPoint(x, y, z0) for x, y in points_xy]
        line_tags = [
            gmsh.model.occ.addLine(point_tags[i], point_tags[(i + 1) % len(point_tags)])
            for i in range(len(point_tags))
        ]
        loop = gmsh.model.occ.addCurveLoop(line_tags)
        surface = gmsh.model.occ.addPlaneSurface([loop])
        extruded = gmsh.model.occ.extrude([(2, surface)], 0, 0, slice_height)
        volumes = [dt[1] for dt in extruded if dt[0] == 3]
        return volumes[0]

    def _occ_magnet_pockets(self):
        tags = []
        for ring in self.rings:
            for magnet in ring.magnets:
                dim = magnet.magnetType.dimension * 1e3
                cut_height = dim + 2
                x = magnet.position[0] * 1e3
                y = magnet.position[1] * 1e3
                z = (magnet.position[2] + ring.position) * 1e3
                box = gmsh.model.occ.addBox(
                    x - dim / 2, y - dim / 2, z - cut_height / 2, dim, dim, cut_height)
                gmsh.model.occ.rotate([(3, box)], x, y, z, 0, 0, 1, magnet.angle)
                tags.append((3, box))
        return tags

    def _occ_rods(self):
        if self.numConnectionRods <= 0 or self.connectionRodDiameter <= 0:
            return []
        tags = []
        diameter = self.connectionRodDiameter * 1e3
        for n in range(self.numConnectionRods):
            angle = np.deg2rad(360 / self.numConnectionRods * (n + 0.5))
            x = self.rodRadius * np.cos(angle)
            y = self.rodRadius * np.sin(angle)
            rod = gmsh.model.occ.addCylinder(x, y, -1000, 0, 0, 2000, diameter / 2)
            tags.append((3, rod))
        return tags

    def _occ_shim_trays(self):
        if self.numConnectionRods <= 0:
            return []
        tags = []
        radial_height = 16.0
        depth = 2000.0
        sector = np.deg2rad(self.shimTrayAngle)
        for n in range(self.numConnectionRods):
            z0 = -1000.0
            inner = self.shimTrayRadius - radial_height
            p1 = gmsh.model.occ.addPoint(inner, 0, z0)
            p2 = gmsh.model.occ.addPoint(self.shimTrayRadius, 0, z0)
            p3 = gmsh.model.occ.addPoint(self.shimTrayRadius, 0, z0 + depth)
            p4 = gmsh.model.occ.addPoint(inner, 0, z0 + depth)
            loop = gmsh.model.occ.addCurveLoop([
                gmsh.model.occ.addLine(p1, p2),
                gmsh.model.occ.addLine(p2, p3),
                gmsh.model.occ.addLine(p3, p4),
                gmsh.model.occ.addLine(p4, p1),
            ])
            surface = gmsh.model.occ.addPlaneSurface([loop])
            start = np.deg2rad(360 / self.numConnectionRods * n + self.shimTrayAngle / 2)
            gmsh.model.occ.rotate([(2, surface)], 0, 0, 0, 0, 0, 1, start)
            revolved = gmsh.model.occ.revolve([(2, surface)], 0, 0, 0, 0, 0, 1, sector)
            tags.extend([dt for dt in revolved if dt[0] == 3])
        return tags

    def _occ_custom_scad(self, key):
        params = getattr(self, 'params', None)
        if not params:
            return []
        slice_params = params['slices'][self.id]
        if key not in slice_params:
            return []
        code = slice_params[key]
        try:
            solids = _parse_scad_cubes(code)
        except ValueError as error:
            print(f"Warning: skipping unsupported {key} on slice {self.id}: {error}")
            return []
        tags = []
        z_offset = self.position * 1e3
        for dims, centered, angle, offset in solids:
            dx, dy, dz = dims
            x, y, z = offset[0], offset[1], offset[2] + z_offset
            if centered:
                box = gmsh.model.occ.addBox(x - dx / 2, y - dy / 2, z - dz / 2, dx, dy, dz)
            else:
                box = gmsh.model.occ.addBox(x, y, z, dx, dy, dz)
            if angle != 0:
                gmsh.model.occ.rotate([(3, box)], x, y, z, 0, 0, 1, angle)
            tags.append((3, box))
        return tags


def _extract_braced_block(text, open_index):
    if open_index >= len(text) or text[open_index] != '{':
        raise ValueError("expected '{' in custom SCAD")
    depth = 0
    for index in range(open_index, len(text)):
        if text[index] == '{':
            depth += 1
        elif text[index] == '}':
            depth -= 1
            if depth == 0:
                return text[open_index + 1:index], index + 1
    raise ValueError("unbalanced braces in custom SCAD")


def _parse_scad_cubes(code, angle=0.0, offset=None):
    """Parse translate/rotate/cube OpenSCAD used in addSCAD/subSCAD."""
    if offset is None:
        offset = np.zeros(3)
    solids = []
    index = 0
    code_len = len(code)
    while index < code_len:
        while index < code_len and code[index] in ' \t\n\r;':
            index += 1
        if index >= code_len:
            break
        remaining = code[index:]
        translate = re.match(r'translate\s*\(\s*v\s*=\s*\[([^\]]+)\]\s*\)\s*', remaining)
        rotate = re.match(r'rotate\s*\(\s*a\s*=\s*([0-9eE.+-]+)\s*\)\s*', remaining)
        cube = re.match(
            r'cube\s*\(\s*\[([^\]]+)\]\s*(?:,\s*center\s*=\s*(true|false))?\s*\)\s*(?:\{\s*\})?',
            remaining)
        if translate:
            vec = np.array([float(value) for value in translate.group(1).split(',')])
            body_start = index + translate.end()
            body, next_index = _extract_braced_block(code, body_start)
            cosine, sine = np.cos(angle), np.sin(angle)
            rotated = np.array([
                cosine * vec[0] - sine * vec[1],
                sine * vec[0] + cosine * vec[1],
                vec[2]
            ])
            solids.extend(_parse_scad_cubes(body, angle, offset + rotated))
            index = next_index
        elif rotate:
            extra_angle = np.deg2rad(float(rotate.group(1)))
            body_start = index + rotate.end()
            body, next_index = _extract_braced_block(code, body_start)
            solids.extend(_parse_scad_cubes(body, angle + extra_angle, offset))
            index = next_index
        elif cube:
            dims = [float(value) for value in cube.group(1).split(',')]
            centered = (cube.group(2) or 'false') == 'true'
            solids.append((dims, centered, angle, offset.copy()))
            index += cube.end()
        else:
            preview = remaining[:48].replace('\n', ' ')
            raise ValueError(f"unsupported SCAD near '{preview}'")
    return solids
