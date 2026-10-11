import { lazy, Suspense, useEffect } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { EngineeringViewportControls } from "./EngineeringViewportControls";
import { PartInspectorCard } from "./PartInspectorCard";
import { PartVisibilityTray } from "./PartVisibilityTray";
import { isImportedModelId } from "./importedModels";
import { listPartsForScanner, listSimulationPartIds, usePartInspectorStore } from "./partInspectorStore";
import { setScannerModel, studioCadForScanner, useScannerModel } from "./scannerModel";
import { useEngineeringStore } from "./engineeringStore";
import { StudioHome } from "./studio/StudioHome";
import { AcquisitionStudio, ReconstructionStudio } from "./studio/StudioApplication";
import { GradientCoilStudio } from "./studio/GradientCoilStudio";
import { HardwareStudyStudio } from "./studio/HardwareStudyStudio";
import { PassiveShimStudio } from "./studio/PassiveShimStudio";
import { useHardwareStudyStore } from "./studio/hardwareStudyStore";
import { rememberProjectView, syncProjectAssembly } from "./studio/library";
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
  const hardwareView = useEngineeringStore((s) => s.hardwareView);
  const setHardwareView = useEngineeringStore((s) => s.setHardwareView);
  const setupIntent = useEngineeringStore((s) => s.setupIntent);
  const clearSetupIntent = useEngineeringStore((s) => s.clearSetupIntent);
  const bindings = usePartInspectorStore((s) => s.bindings);
  const catalog = usePartInspectorStore((s) => s.catalog);

  useEffect(() => {
    if (!activeProject || activeProject.application !== "hardware") return;
    const included = listSimulationPartIds(scannerId, catalog, bindings).length;
    const total = listPartsForScanner(scannerId, catalog, bindings).length;
    syncProjectAssembly(activeProject.id, { catalogParts: total, includedParts: included });
  }, [activeProject, bindings, catalog, scannerId]);

  useEffect(() => {
    if (!activeProject || activeProject.application !== "hardware") return;
    rememberProjectView(activeProject.id, hardwareView);
  }, [activeProject, hardwareView]);

  useEffect(() => {
    if (!setupIntent || !activeProject) return;
    if (hardwareView !== "magnet" && hardwareView !== "fem") {
      clearSetupIntent();
      return;
    }
    useHardwareStudyStore.getState().setSection(activeProject.id, hardwareView, "setup");
    clearSetupIntent();
  }, [activeProject, clearSetupIntent, hardwareView, setupIntent]);

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
      <div className={`engineering-stage${activeProject && (hardwareView === "magnet" || hardwareView === "fem") ? " is-hardware-study" : ""}`}>
        {activeProject ? (
          <button type="button" className="studio-close-project" onClick={closeProject}>
            Close project
          </button>
        ) : null}
        {activeProject?.application === "acquisition" ? (
          <AcquisitionStudio projectName={activeProject.name} />
        ) : activeProject?.application === "reconstruction" ? (
          <ReconstructionStudio projectName={activeProject.name} />
        ) : activeProject && hardwareView === "gradients" ? (
          <GradientCoilStudio projectName={activeProject.name} onAssembly={() => setHardwareView("assembly")} />
        ) : activeProject && hardwareView === "shimming" ? (
          <PassiveShimStudio projectName={activeProject.name} onAssembly={() => setHardwareView("assembly")} />
        ) : activeProject ? (
          <>
            {hardwareView === "magnet" || hardwareView === "fem" ? (
              <HardwareStudyStudio projectId={activeProject.id} projectName={activeProject.name} study={hardwareView} />
            ) : (
              <nav className="studio-study-nav" aria-label="Hardware studies">
                <button type="button" className="studio-gradient-open" aria-pressed={hardwareView === "assembly"} onClick={() => setHardwareView("assembly")}>
                  Assembly
                </button>
                <button type="button" className="studio-gradient-open" aria-pressed={hardwareView === "magnet"} onClick={() => setHardwareView("magnet")}>
                  Magnet field
                </button>
                <button type="button" className="studio-shim-open" aria-pressed={hardwareView === "fem"} onClick={() => setHardwareView("fem")}>
                  Elmer FEM
                </button>
                <button type="button" className="studio-gradient-open" onClick={() => setHardwareView("gradients")}>
                  Gradient coils
                </button>
                <button type="button" className="studio-shim-open" onClick={() => setHardwareView("shimming")}>
                  Passive shimming
                </button>
              </nav>
            )}
            <EngineeringViewportControls />
            {empty && hardwareView === "assembly" ? (
              <div className="eng-empty" role="status">
                <strong>Nothing in simulation yet</strong>
                <p>
                  Engineering Studio shows only parts added to simulation. Open Settings, select a
                  component, and choose Add to simulation.
                </p>
              </div>
            ) : null}
            {navTool === "inspect" && hardwareView === "assembly" ? (
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
