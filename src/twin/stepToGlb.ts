import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import occtimportjs from "occt-import-js";
import occtWasm from "occt-import-js/dist/occt-import-js.wasm?url";

type Occt = Awaited<ReturnType<typeof occtimportjs>>;

let occtPromise: Promise<Occt> | null = null;

function loadOcct(): Promise<Occt> {
  occtPromise ??= occtimportjs({
    locateFile: (path) => (path.endsWith(".wasm") ? occtWasm : path),
  });
  return occtPromise;
}

function meshFromOcct(source: {
  name?: string;
  color?: number[];
  attributes: { position: { array: number[] }; normal?: { array: number[] } };
  index: { array: number[] };
}): THREE.Mesh | null {
  const positions = source.attributes.position?.array;
  const indices = source.index?.array;
  if (!positions?.length || !indices?.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (source.attributes.normal?.array?.length) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(source.attributes.normal.array, 3));
  }
  geometry.setIndex(Array.from(indices));
  const welded = mergeVertices(geometry, 1e-6);
  geometry.dispose();
  if (!welded.getAttribute("normal")) welded.computeVertexNormals();
  const color = source.color;
  const material = new THREE.MeshStandardMaterial({
    color: color
      ? new THREE.Color(color[0] ?? 0.75, color[1] ?? 0.75, color[2] ?? 0.75)
      : 0xb8b8b8,
    metalness: 0.2,
    roughness: 0.45,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(welded, material);
  mesh.name = source.name?.trim() || "STEP part";
  return mesh;
}

export async function stepFileToGlbBlob(file: File): Promise<Blob> {
  const occt = await loadOcct();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = occt.ReadStepFile(bytes, { linearUnit: "meter" });
  if (!result?.success || !result.meshes?.length) {
    throw new Error("Could not tessellate that STEP file.");
  }
  const root = new THREE.Group();
  root.name = file.name.replace(/\.(step|stp)$/i, "") || "STEP";
  for (const source of result.meshes) {
    const mesh = meshFromOcct(source);
    if (mesh) root.add(mesh);
  }
  if (root.children.length === 0) {
    throw new Error("That STEP file has no tessellated surfaces.");
  }
  const exporter = new GLTFExporter();
  const exported = await exporter.parseAsync(root, { binary: true });
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) mat.dispose();
    }
  });
  if (!(exported instanceof ArrayBuffer)) {
    throw new Error("STEP conversion did not produce a GLB.");
  }
  return new Blob([exported], { type: "model/gltf-binary" });
}
