import { Box, FolderOpen, Layers, Library, Magnet, Plus, Radio, Shield, Thermometer } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  APPLICATIONS,
  PLUGINS,
  TUTORIALS,
  formatEdited,
  formatParts,
  readInstalledPluginIds,
  readProjects,
  saveNewProject,
  seedProjects,
  setPluginInstalled,
  touchProject,
  type StudioApplication,
  type StudioPlugin,
  type StudioProject,
} from "./library";
import "./studioHome.css";

type StudioHomeProps = {
  onOpenProject: (project: StudioProject) => void;
};

const FEATURED_TOOL_COUNT = 3;
const FEATURED_TUTORIAL = TUTORIALS[0];
const LESSONS = TUTORIALS.slice(1);

const TOOL_ICONS: Record<string, typeof Magnet> = {
  "field-mapper": Magnet,
  "shim-optimizer": Layers,
  "thermal-solver": Thermometer,
  "rf-budget": Radio,
  "emi-kit": Shield,
  "material-library": Library,
};

export function StudioHome({ onOpenProject }: StudioHomeProps) {
  const nameId = useId();
  const errorId = useId();
  const openPanelId = useId();
  const openPanelRef = useRef<HTMLDivElement | null>(null);
  const [projects, setProjects] = useState(readProjects);
  const [examples] = useState(seedProjects);
  const [installed, setInstalled] = useState(readInstalledPluginIds);
  const [mode, setMode] = useState<"idle" | "create" | "open">("idle");
  const [draft, setDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [application, setApplication] = useState<StudioApplication | null>(null);
  const [startedTutorialId, setStartedTutorialId] = useState<string | null>(null);
  const [showAllTools, setShowAllTools] = useState(false);

  const recent = projects.filter((project) => project.kind === "user");
  const tools = showAllTools ? PLUGINS : PLUGINS.slice(0, FEATURED_TOOL_COUNT);

  useEffect(() => {
    if (mode !== "open") return;
    openPanelRef.current?.querySelector<HTMLElement>("button, [tabindex]")?.focus();
  }, [mode]);

  function beginCreate() {
    setMode("create");
    setFormError(null);
  }

  function beginOpen() {
    setMode("open");
    setFormError(null);
  }

  function closeModes() {
    setMode("idle");
    setDraft("");
    setFormError(null);
    setApplication(null);
  }

  function openProject(project: StudioProject) {
    const next = touchProject(project.id) ?? project;
    setProjects(readProjects());
    onOpenProject(next);
  }

  function createProject(event: FormEvent) {
    event.preventDefault();
    const name = draft.trim();
    if (!name) {
      setFormError("Give the project a name.");
      return;
    }
    if (!application) {
      setFormError("Choose an application.");
      return;
    }
    const project = saveNewProject(name, { application });
    setProjects(readProjects());
    closeModes();
    onOpenProject(project);
  }

  function togglePlugin(id: string) {
    const nextInstalled = !installed.includes(id);
    setInstalled(setPluginInstalled(id, nextInstalled));
  }

  return (
    <section className="studio-home" aria-label="Engineering Studio start">
      <div className="studio-home-card">
        <header className="studio-home-head">
          <div className="studio-home-intro">
            <h2>Engineering Studio</h2>
            <p className="studio-lede">Design, simulate, and refine your MRI system.</p>
          </div>
          <div className="studio-actions">
            <div className="studio-action-row">
              <button
                type="button"
                className="studio-new-btn"
                aria-expanded={mode === "create"}
                onClick={() => (mode === "create" ? closeModes() : beginCreate())}
              >
                <Plus size={16} strokeWidth={2} aria-hidden />
                New project
              </button>
              <button
                type="button"
                className="studio-ghost"
                aria-expanded={mode === "open"}
                aria-controls={openPanelId}
                onClick={() => (mode === "open" ? closeModes() : beginOpen())}
              >
                <FolderOpen size={16} strokeWidth={1.75} aria-hidden />
                Open project
              </button>
            </div>
            {mode === "open" ? (
              <div
                id={openPanelId}
                ref={openPanelRef}
                className="studio-open-panel"
                role="region"
                aria-label="Saved projects"
                tabIndex={-1}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeModes();
                  }
                }}
              >
                {recent.length === 0 ? (
                  <p>No saved projects to open.</p>
                ) : (
                  <ul>
                    {recent.map((project) => (
                      <li key={project.id}>
                        <button type="button" onClick={() => openProject(project)}>
                          {project.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </header>

        {mode === "create" ? (
          <form className="studio-create" onSubmit={createProject}>
            <div className="studio-create-name">
              <label htmlFor={nameId}>Project name</label>
              <input
                id={nameId}
                value={draft}
                autoFocus
                maxLength={80}
                placeholder="Name this project"
                aria-invalid={formError === "Give the project a name."}
                aria-describedby={formError ? errorId : undefined}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (formError) setFormError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeModes();
                  }
                }}
              />
            </div>
            <fieldset className="studio-choice-set">
              <legend>Application</legend>
              <div className="studio-choice-row">
                {APPLICATIONS.map((item) => (
                  <label key={item.id} className="studio-choice">
                    <input
                      type="radio"
                      name="studio-application"
                      value={item.id}
                      checked={application === item.id}
                      onChange={() => {
                        setApplication(item.id);
                        if (formError) setFormError(null);
                      }}
                    />
                    <span className="studio-choice-copy">
                      <span className="studio-project-name">{item.label}</span>
                      <span className="studio-project-meta">{item.summary}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="studio-create-actions">
              <button type="submit">Create</button>
              <button type="button" className="studio-ghost" onClick={closeModes}>
                Cancel
              </button>
              {formError ? (
                <p id={errorId} className="studio-name-error" role="alert">
                  {formError}
                </p>
              ) : (
                <p className="studio-create-hint">
                  {!application
                    ? "Choose hardware, acquisition, or reconstruction."
                    : "The studio opens for this application."}
                </p>
              )}
            </div>
          </form>
        ) : null}

        <div className="studio-main">
          <div className="studio-projects">
            <section aria-labelledby="studio-recent-heading">
              <h3 id="studio-recent-heading">Recent projects</h3>
              {recent.length === 0 ? (
                <div className="studio-empty">
                  <p>No recent projects.</p>
                  <div className="studio-action-row">
                    <button type="button" className="studio-ghost" onClick={beginCreate}>
                      New project
                    </button>
                    <button type="button" className="studio-ghost" onClick={beginOpen}>
                      Open project
                    </button>
                  </div>
                </div>
              ) : (
                <ul className="studio-project-list">
                  {recent.map((project) => (
                    <li key={project.id}>
                      <ProjectRow project={project} onOpen={openProject} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="studio-examples-heading">
              <h3 id="studio-examples-heading">Example projects</h3>
              <ul className="studio-example-list">
                {examples.map((project) => (
                  <li key={project.id}>
                    <button type="button" className="studio-example" onClick={() => openProject(project)}>
                      <Box size={16} strokeWidth={1.75} aria-hidden />
                      <span className="studio-project-copy">
                        <span className="studio-project-name">{project.name}</span>
                        <span className="studio-project-meta">
                          {project.discipline} · {formatParts(project.parts)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="studio-learn" aria-labelledby="studio-learn-heading">
            <h3 id="studio-learn-heading">Getting started</h3>
            {FEATURED_TUTORIAL ? (
              <article className="studio-feature">
                <span className="studio-art-frame">
                  <TutorialArt id={FEATURED_TUTORIAL.id} />
                </span>
                <div className="studio-feature-copy">
                  <h4>{FEATURED_TUTORIAL.title}</h4>
                  <p>{FEATURED_TUTORIAL.summary}</p>
                  <div className="studio-feature-actions">
                    <span className="studio-project-meta">{FEATURED_TUTORIAL.duration}</span>
                    <button
                      type="button"
                      className="studio-ghost"
                      aria-pressed={startedTutorialId === FEATURED_TUTORIAL.id}
                      onClick={() => setStartedTutorialId(FEATURED_TUTORIAL.id)}
                    >
                      Start tutorial
                    </button>
                  </div>
                </div>
              </article>
            ) : null}
            <ul className="studio-lesson-list">
              {LESSONS.map((lesson) => (
                <li key={lesson.id}>
                  <button
                    type="button"
                    className="studio-lesson"
                    aria-pressed={startedTutorialId === lesson.id}
                    onClick={() => setStartedTutorialId(lesson.id)}
                  >
                    <span className="studio-project-name">{lesson.title}</span>
                    <span className="studio-project-meta">{lesson.duration}</span>
                    <span className="studio-lesson-summary">{lesson.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="studio-tools" aria-labelledby="studio-tools-heading">
          <div className="studio-tools-head">
            <h3 id="studio-tools-heading">Extend your studio</h3>
            <button
              type="button"
              className="studio-text-btn"
              aria-expanded={showAllTools}
              onClick={() => setShowAllTools((open) => !open)}
            >
              {showAllTools ? "Show fewer tools" : "Browse all tools →"}
            </button>
          </div>
          <ul className="studio-tool-grid">
            {tools.map((plugin) => (
              <ToolTile
                key={plugin.id}
                plugin={plugin}
                added={installed.includes(plugin.id)}
                onToggle={() => togglePlugin(plugin.id)}
              />
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

function ProjectRow({
  project,
  onOpen,
}: {
  project: StudioProject;
  onOpen: (project: StudioProject) => void;
}) {
  return (
    <button type="button" className="studio-project" onClick={() => onOpen(project)}>
      <span className="studio-project-mark" aria-hidden>
        <Box size={16} strokeWidth={1.75} />
      </span>
      <span className="studio-project-copy">
        <span className="studio-project-name">{project.name}</span>
        <span className="studio-project-meta">
          {project.discipline} · {formatParts(project.parts)}
        </span>
        <span className="studio-project-meta">{formatEdited(project.updatedAt)}</span>
      </span>
    </button>
  );
}

function ToolTile({
  plugin,
  added,
  onToggle,
}: {
  plugin: StudioPlugin;
  added: boolean;
  onToggle: () => void;
}) {
  const Icon = TOOL_ICONS[plugin.id] ?? Box;
  return (
    <li className="studio-tool">
      <span className="studio-project-mark" aria-hidden>
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <span className="studio-project-copy">
        <span className="studio-project-name">{plugin.name}</span>
        <span className="studio-plugin-summary">{plugin.summary}</span>
      </span>
      <button
        type="button"
        className="studio-add-btn"
        aria-pressed={added}
        aria-label={added ? `Remove ${plugin.name}` : `Add ${plugin.name}`}
        onClick={onToggle}
      >
        {added ? "Added" : "Add"}
      </button>
    </li>
  );
}

function TutorialArt({ id }: { id: string }) {
  if (id === "assemble") {
    return (
      <svg className="studio-art" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <rect width="320" height="180" fill="#2b2e34" />
        <rect x="78" y="78" width="86" height="54" rx="8" fill="#4a4e57" />
        <rect x="118" y="48" width="92" height="58" rx="8" fill="#5c616b" />
        <rect x="154" y="86" width="88" height="50" rx="8" fill="#d7dbe2" />
      </svg>
    );
  }
  if (id === "materials") {
    return (
      <svg className="studio-art" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <rect width="320" height="180" fill="#2b2e34" />
        <rect x="46" y="36" width="228" height="28" rx="6" fill="#8d939e" />
        <rect x="46" y="72" width="228" height="28" rx="6" fill="#c4a27a" />
        <rect x="46" y="108" width="228" height="28" rx="6" fill="#d9dde4" />
      </svg>
    );
  }
  if (id === "field") {
    return (
      <svg className="studio-art" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <rect width="320" height="180" fill="#2b2e34" />
        <path d="M24 58c48 0 48 64 96 64s48-64 96-64 48 64 80 64" fill="none" stroke="#9fdfff" strokeWidth="2" />
        <path d="M24 90c48 0 48 48 96 48s48-48 96-48 48 48 80 48" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
        <path d="M24 122c48 0 48 32 96 32s48-32 96-32 48 32 80 32" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
        <rect x="148" y="28" width="24" height="124" rx="12" fill="none" stroke="#f4f5f7" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg className="studio-art" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="320" height="180" fill="#2b2e34" />
      <ellipse cx="160" cy="92" rx="92" ry="36" fill="none" stroke="rgba(159,223,255,0.85)" strokeWidth="1.5" strokeDasharray="5 6" />
      <circle cx="160" cy="92" r="40" fill="none" stroke="#f4f5f7" strokeWidth="7" />
      <circle cx="160" cy="92" r="16" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
    </svg>
  );
}
