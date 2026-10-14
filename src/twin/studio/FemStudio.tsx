import { ElmerStepStudio } from "./ElmerStepStudio";

/** FEM always uses imported STEP solids, independently of the scanner assembly. */
export function FemStudio(props: { projectId: string; projectName: string; onClose?: () => void }) {
  return <ElmerStepStudio {...props} />;
}
