import { HardwareProjectPersistence } from "./studio/HardwareProjectPersistence";
import { ProjectPersistence, flushProject } from "./studio/ProjectPersistence";
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
import { AcquisitionStudio } from "./studio/StudioApplication";
import { GradientCoilStudio } from "./studio/GradientCoilStudio";
import { FemStudio } from "./studio/FemStudio";
import { HardwareStudyStudio } from "./studio/HardwareStudyStudio";
import { PassiveShimStudio } from "./studio/PassiveShimStudio";
import { useHardwareStudyStore } from "./studio/hardwareStudyStore";
import { rememberProjectView, syncProjectAssembly } from "./studio/library";
import "./studio/studioWork.css";
import "./studio/hardwareWorkspace.css";

const EngineeringCanvas = lazy(() =>
  import("./EngineeringCanvas").then((m) => ({ default: m.EngineeringCanvas })),
);

export function EngineeringStudio() {
  const [scannerId] = useScannerModel();
  const navTool = useEngineeringStore((s) => s.navTool);
  const activeProject = useEngineeringStore((s) => s.activeProject);
  const openProject = useEngineeringStore((s) => s.openProject);
  const close = useEngineeringStore((s) => s.closeProject);
  const closeProject = () => { if (activeProject) void flushProject(activeProject.id).then(close).catch(() => undefined); };
  const partCount = useEngineeringStore((s) => s.partCount);
  const catalogCount = useEngineeringStore((s) => s.catalogCount);
  const studio = studioCadForScanner(scannerId);
  const empty = catalogCount > 0 && partCount === 0;
  const hardwareView = useEngineeringStore((s) => s.hardwareView);
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
    useHardwareStudyStore.getState().setPreparation(activeProject.id, hardwareView, { editingSetup: true, setupStep: "parts" });
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

  const viewport = (
    <div className="engineering-viewport">
      <EngineeringViewportControls />
      <div className="engineering-canvas-region">
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
      </div>
    </div>
  );

  const contents = (
    <section className="engineering-studio" aria-label="Engineering Studio">
      <div className={`engineering-stage${activeProject && (hardwareView === "magnet" || hardwareView === "fem") ? " is-hardware-study" : ""}`}>
        {activeProject && activeProject.application !== "acquisition" && hardwareView !== "gradients" && hardwareView !== "shimming" && hardwareView !== "magnet" && hardwareView !== "fem" ? (
          <button type="button" className="studio-close-project" onClick={closeProject}>
            Close project
          </button>
        ) : null}
        {activeProject?.application === "acquisition" ? (
          <AcquisitionStudio key={activeProject.id} projectName={activeProject.name} onClose={closeProject} />
        ) : activeProject && hardwareView === "gradients" ? (
          <GradientCoilStudio
            projectName={activeProject.name}
            onClose={closeProject}
          />
        ) : activeProject && hardwareView === "shimming" ? (
          <PassiveShimStudio
            projectName={activeProject.name}
            onClose={closeProject}
          />
        ) : activeProject && hardwareView === "fem" ? (
          <FemStudio key={activeProject.id} projectId={activeProject.id} projectName={activeProject.name} onClose={closeProject} />
        ) : activeProject ? (
          <>
            {hardwareView === "magnet" ? (
              <HardwareStudyStudio key={`${activeProject.id}:${hardwareView}`} projectId={activeProject.id} projectName={activeProject.name} study={hardwareView} viewport={viewport} onClose={closeProject} />
            ) : viewport}
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

          </>
        ) : (
          <StudioHome onOpenProject={openProject} />
        )}
      </div>
    </section>
  );
  return activeProject ? <ProjectPersistence key={activeProject.id} id={activeProject.id}><HardwareProjectPersistence id={activeProject.id}>{contents}</HardwareProjectPersistence></ProjectPersistence> : contents;
}
