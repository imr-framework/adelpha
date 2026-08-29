declare module "occt-import-js" {
  export type OcctMesh = {
    name?: string;
    color?: number[];
    attributes: {
      position: { array: number[] };
      normal?: { array: number[] };
    };
    index: { array: number[] };
  };

  export type OcctImportResult = {
    success?: boolean;
    meshes?: OcctMesh[];
  };

  export type OcctTessellationParams = {
    linearUnit?: "millimeter" | "centimeter" | "meter" | "inch" | "foot";
    linearDeflectionType?: "bounding_box_ratio" | "absolute_value";
    linearDeflection?: number;
    angularDeflection?: number;
  };

  export default function occtimportjs(moduleArg?: {
    locateFile?: (path: string, scriptDirectory: string) => string;
  }): Promise<{
    ReadStepFile: (content: Uint8Array, params?: OcctTessellationParams | null) => OcctImportResult;
  }>;
}
