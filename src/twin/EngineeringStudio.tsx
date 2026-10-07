import { lazy, Suspense, useEffect } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { EngineeringViewportControls } from "./EngineeringViewportControls";
import { PartInspectorCard } from "./PartInspectorCard";
import { PartVisibilityTray } from "./PartVisibilityTray";
import { isImportedModelId } from "./importedModels";
import { usePartInspectorStore } from "./partInspectorStore";
import { setScannerModel, studioCadForScanner, useScannerModel } from "./scannerModel";
import { useEngineeringStore } from "./engineeringStore";
import { StudioHome } from "./studio/StudioHome";
import { AcquisitionStudio, ReconstructionStudio } from "./studio/StudioApplication";
import "./studio/studioWork.css";

const EngineeringCanvas = lazy(() =>
  import("./EngineeringCanvas").then((m) => ({ default: m.EngineeringCanvas })),
);

export function EngineeringStudio() {
  const [scannerId] = useScannerModel();
  const navTool = useEngineeringStore((s) => s.navTool);
  const activeProject = useEngineeringStore((s) => s.activeProject);
  const openProject = useEngineeringStore((s) => s.openProject);
  const closeProject = useEngineeringStore((s) => s.closeProject);
  const partCount = useEngineeringStore((s) => s.partCount);
  const catalogCount = useEngineeringStore((s) => s.catalogCount);
  const studio = studioCadForScanner(scannerId);
  const empty = catalogCount > 0 && partCount === 0;

  useEffect(() => {
    const inspector = usePartInspectorStore.getState();
    const previous = {
      inspectionMode: inspector.inspectionMode,
      hidden: inspector.hidden,
      selected: inspector.selected,
      selection: inspector.selection,
    };
    return () => {
      useEngineeringStore.getState().setFrame(null);
      useEngineeringStore.getState().setNavTool("orbit");
      const store = usePartInspectorStore.getState();
      store.setInspectionMode(previous.inspectionMode);
      usePartInspectorStore.setState({
        hidden: previous.hidden,
        selected: previous.selected,
        selection: previous.selection,
      });
    };
  }, []);

  return (
    <section className="engineering-studio" aria-label="Engineering Studio">
      <div className="engineering-stage">
        {activeProject ? (
          <button type="button" className="studio-close-project" onClick={closeProject}>
            Close project
          </button>
        ) : null}
        {activeProject?.application === "acquisition" ? (
          <AcquisitionStudio projectName={activeProject.name} />
        ) : activeProject?.application === "reconstruction" ? (
          <ReconstructionStudio projectName={activeProject.name} />
        ) : activeProject ? (
          <>
            <EngineeringViewportControls />
            {empty ? (
              <div className="eng-empty" role="status">
                <strong>Nothing in simulation yet</strong>
                <p>
                  Engineering Studio shows only parts added to simulation. Open Settings, select a
                  component, and choose Add to simulation.
                </p>
              </div>
            ) : null}
            {navTool === "inspect" ? (
              <div className="part-inspect-stack">
                <PartInspectorCard />
                <PartVisibilityTray />
              </div>
            ) : null}
            <ErrorBoundary
              resetKey={studio.cad.url}
              onError={() => {
                if (isImportedModelId(scannerId)) setScannerModel("delta-v2");
              }}
              fallbackRender={(error) => (
                <div className="viewport-cad-error">
                  <p>
                    {/webgl/i.test(error.message)
                      ? "This display could not start a 3D viewport."
                      : "Could not load the MRI assembly for Engineering Studio."}
                  </p>
                </div>
              )}
            >
              <Suspense fallback={<div className="engineering-loading">Loading MRI assembly…</div>}>
                <EngineeringCanvas />
              </Suspense>
            </ErrorBoundary>
          </>
        ) : (
          <StudioHome onOpenProject={openProject} />
        )}
      </div>
    </section>
  );
}
