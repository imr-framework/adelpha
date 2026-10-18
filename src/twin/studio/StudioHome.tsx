import {
  BookOpen,
  Box,
  FileText,
  GraduationCap,
  MoreHorizontal,
  MessageSquare,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { requestOpenSettings } from "../settingsOpen";
import {
  APPLICATIONS,
  PROJECT_CLASS_FILTERS,
  STUDIO_DOCS_URL,
  TUTORIALS,
  createFromExample,
  deleteProject,
  formatModifiedDate,
  hasSetupDestination,
  previewKind,
  projectClass,
  projectClassMeta,
  projectDetail,
  projectPreviewSrc,
  readProjects,
  saveNewProject,
  seedProjects,
  setupViewFor,
  shortcutLabel,
  touchProject,
  tutorialOpensModelSettings,
  tutorialPreviewSrc,
  visibleProjects,
  type StudioApplication,
  type StudioProject,
  type StudioProjectClass,
  type StudioSort,
} from "./library";
import { StudioAgent } from "./StudioAgent";
import "./studioHome.css";
import "./compactLibrary.css";

type StudioHomeProps = {
  onOpenProject: (project: StudioProject, options?: { view?: StudioProject["lastView"]; setup?: boolean }) => void;
};

type NavId = "projects" | "examples" | "tutorials" | "agent";

const pageCopy: Record<Exclude<NavId, "agent">, { crumb: string; title: string; lede: string }> = {
  projects: {
    crumb: "Projects",
    title: "Your engineering workspace",
    lede: "Design, simulate, and refine your MRI system.",
  },
  examples: {
    crumb: "Examples",
    title: "Examples",
    lede: "Copy a starter into your own project.",
  },
  tutorials: {
    crumb: "Tutorials",
    title: "Tutorials",
    lede: "Short lessons for navigating and inspecting the studio.",
  },
};

export function StudioHome({ onOpenProject }: StudioHomeProps) {
  const [deleting, setDeleting] = useState<StudioProject | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (deleting) deleteDialog.current?.showModal(); }, [deleting]);
  const nameId = useId();
  const newProjectRef = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const searchId = useId();
  const sortId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [ready, setReady] = useState(false);
  const [examples] = useState(seedProjects);
  const [mode, setMode] = useState<"idle" | "create">("idle");
  const [draft, setDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [application, setApplication] = useState<StudioApplication | null>(null);
  const [hardwareChoice, setHardwareChoice] = useState<NonNullable<StudioProject["lastView"]>>("magnet");
  const [startedTutorialId, setStartedTutorialId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | StudioProjectClass>("all");
  const [sort, setSort] = useState<StudioSort>("modified");
  const [nav, setNav] = useState<NavId>("projects");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const shortcut = useMemo(shortcutLabel, []);

  useEffect(() => {
    setProjects(readProjects());
    setReady(true);
  }, []);

  const userProjects = useMemo(() => projects.filter((project) => project.kind === "user"), [projects]);
  const shown = useMemo(() => visibleProjects(projects, query, filter, sort), [filter, projects, query, sort]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      event.stopPropagation();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (!openMenuId) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-project-menu]")) return;
      setOpenMenuId(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuId]);

  function beginCreate() {
    setMode("create");
    setFormError(null);
    setOpenError(null);
  }

  function closeModes() {
    setMode("idle");
    newProjectRef.current?.focus();
    setDraft("");
    setFormError(null);
    setApplication(null);
    setHardwareChoice("magnet");
  }

  function openSaved(project: StudioProject, options?: { view?: StudioProject["lastView"]; setup?: boolean }) {
    setOpenMenuId(null);
    setOpenError(null);
    try {
      const next = touchProject(project.id) ?? project;
      setProjects(readProjects());
      onOpenProject(next, options);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : "Could not open that project.");
    }
  }

  function openExample(example: StudioProject) {
    setOpenError(null);
    try {
      const project = createFromExample(example);
      setProjects(readProjects());
      onOpenProject(project);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : "Could not create a project from that example.");
    }
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
    try {
    const project = saveNewProject(name, { application, ...(application === "hardware" ? { lastView: hardwareChoice } : {}) });
    setProjects(readProjects());
    closeModes();
    if (application === "hardware") onOpenProject(project, { view: hardwareChoice, setup: hardwareChoice === "fem" });
    else onOpenProject(project);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create the project.");
    }
  }

  function goTo(id: NavId) {
    setNav(id);
    setOpenMenuId(null);
    closeModes();
  }

  return (
    <section className="studio-home" aria-label="Engineering Studio start">
      {deleting ? <dialog ref={deleteDialog} className="studio-delete-dialog" aria-labelledby="delete-project-title" onCancel={event => { if (deletingBusy) event.preventDefault(); else setDeleting(null); }}>
        <h2 id="delete-project-title">Delete “{deleting.name}”?</h2>
        <p>This removes the saved project and its study history from this browser. This cannot be undone. Shared scanner models and examples are kept.</p>
        {deleteError ? <p role="alert">{deleteError}</p> : null}
        <div><button type="button" autoFocus disabled={deletingBusy} onClick={() => setDeleting(null)}>Cancel</button><button type="button" className="studio-delete-confirm" disabled={deletingBusy} onClick={async () => {
          setDeletingBusy(true);
          try { await deleteProject(deleting.id); setProjects(readProjects()); setDeleting(null); newProjectRef.current?.focus(); }
          catch { setDeleteError("Could not delete the project. Please try again."); }
          finally { setDeletingBusy(false); }
        }}>Delete project</button></div>
      </dialog> : null}
      <nav className="studio-nav" aria-label="Workspace">
        <p className="studio-nav-label">Workspace</p>
        <div className="studio-nav-list">
          <NavButton id="projects" label="Projects" active={nav === "projects"} Icon={Box} onClick={() => goTo("projects")} />
          <NavButton id="examples" label="Examples" active={nav === "examples"} Icon={BookOpen} onClick={() => goTo("examples")} />
          <NavButton id="tutorials" label="Tutorials" active={nav === "tutorials"} Icon={GraduationCap} onClick={() => goTo("tutorials")} />
          <NavButton id="agent" label="Agent" active={nav === "agent"} Icon={MessageSquare} onClick={() => goTo("agent")} />
        </div>
        <div className="studio-nav-foot">
          <a className="studio-nav-item" href={STUDIO_DOCS_URL} target="_blank" rel="noreferrer">
            <FileText size={16} strokeWidth={1.75} aria-hidden />
            Documentation
          </a>
          <button type="button" className="studio-nav-item" onClick={() => requestOpenSettings()}>
            <Settings size={16} strokeWidth={1.75} aria-hidden />
            Settings
          </button>
        </div>
      </nav>

      <div hidden={nav !== "agent"} className="studio-agent-host"><StudioAgent /></div>
      {nav !== "agent" && <div className={`studio-home-main${nav === "projects" ? " compact-library" : ""}${nav === "projects" && mode === "create" ? " is-creating" : ""}`}>
        <header className="studio-home-head">
          {nav === "projects" ? <div className="compact-title"><h2 id="studio-projects-heading">Projects</h2><span>{ready ? `${shown.length} ${shown.length === 1 ? "project" : "projects"}` : "Loading…"}</span></div> : (
          <div className="studio-home-intro">
            <p className="studio-crumb">Engineering Studio / {pageCopy[nav].crumb}</p>
            <h2>{pageCopy[nav].title}</h2>
            <p className="studio-lede">{pageCopy[nav].lede}</p>
          </div>)}
          {nav === "projects" ? (
          <div className="studio-actions">
            <div className="studio-action-row">
              <button
                type="button"
                className="studio-new-btn"
                ref={newProjectRef}
                aria-expanded={mode === "create"}
                onClick={() => (mode === "create" ? closeModes() : beginCreate())}
              >
                <Plus size={16} strokeWidth={2} aria-hidden />
                New project
              </button>
            </div>
          </div>
          ) : null}
        </header>

        {nav === "projects" && mode === "create" ? (
          <form className="studio-create" aria-label="New project" onSubmit={createProject} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeModes(); } }}>
            <div className="compact-create-heading"><h3>New project</h3><button type="button" className="studio-icon-btn" aria-label="Close new project" onClick={closeModes}><X size={18} /></button></div>
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
                      <span className="studio-project-name">{item.id === "acquisition" ? "Acquisition" : item.label}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {application === "hardware" ? <label className="compact-workspace">Hardware workspace
              <select value={hardwareChoice} onChange={(event) => setHardwareChoice(event.target.value as typeof hardwareChoice)}>
                <option value="assembly">Assembly</option><option value="magnet">Halbach array</option><option value="fem">FEM</option><option value="gradients">Gradient coils</option><option value="rf">RF coils</option><option value="shimming">Passive shimming</option>
              </select>
            </label> : null}
            <div className="studio-create-actions">
              <button type="submit">Create project</button>
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
                    ? "Choose hardware or acquisition."
                    : application === "hardware" ? `Opens directly in ${{ assembly: "Assembly", magnet: "Halbach array", fem: "FEM", gradients: "Gradient coils", rf: "RF coils", shimming: "Passive shimming" }[hardwareChoice]}.` : "Opens directly in Acquisition."}
                </p>
              )}
            </div>
          </form>
        ) : null}

        {openError ? (
          <p className="studio-open-error" role="alert">
            {openError}
          </p>
        ) : null}

        {nav === "projects" ? (
        <div className="compact-toolbar"><div className="studio-search">
          <Search size={16} strokeWidth={1.75} aria-hidden />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={query}
            aria-label="Search projects"
            placeholder="Search projects…"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button type="button" className="studio-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          <kbd className="studio-search-kbd">{shortcut}</kbd>
        </div>
        <select aria-label="Project type" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>{PROJECT_CLASS_FILTERS.map((item) => <option key={item.id} value={item.id}>{item.id === "all" ? "All types" : item.label}</option>)}</select>
        <select id={sortId} aria-label="Sort projects" value={sort} onChange={(event) => setSort(event.target.value as StudioSort)}><option value="modified">Last modified</option><option value="name">Name</option></select>
        </div>
        ) : null}
        {nav === "projects" ? (
        <section className="studio-collection" aria-labelledby="studio-projects-heading">
          {!ready ? (
            <p className="studio-empty-copy" role="status">
              Loading projects…
            </p>
          ) : userProjects.length === 0 ? (
            <div className="studio-empty">
              <p>No projects yet. Start a new study or copy an example from Examples.</p>
              <div className="studio-action-row">
                <button type="button" className="studio-new-btn" onClick={beginCreate}>
                  <Plus size={16} strokeWidth={2} aria-hidden />
                  New project
                </button>
              </div>
            </div>
          ) : shown.length === 0 ? (
            <div className="studio-empty">
              <p>No projects match that search.</p>
              <button type="button" className="studio-ghost" onClick={() => { setQuery(""); setFilter("all"); }}>
                Show all projects
              </button>
            </div>
          ) : (
            <div className="compact-table-wrap"><table className="compact-project-table"><thead><tr><th scope="col">Name</th><th scope="col">Workspace</th><th scope="col">Updated</th><th scope="col"><span className="studio-sr">Actions</span></th></tr></thead><tbody>
              {shown.map((project) => <ProjectRow key={project.id} onDelete={() => { setOpenMenuId(null); setDeleteError(""); setDeleting(project); }} project={project} menuOpen={openMenuId === project.id} onOpen={() => openSaved(project)} onSetup={hasSetupDestination(project) ? () => openSaved(project, { view: setupViewFor(project), setup: true }) : undefined} onMenu={() => setOpenMenuId((id) => id === project.id ? null : project.id)} />)}
            </tbody></table></div>
          )}
        </section>
        ) : null}

        {nav === "examples" ? (
          <section className="studio-learn-page" aria-label="Examples">
            <p className="studio-learn-count">
              {examples.length} {examples.length === 1 ? "example" : "examples"}
            </p>
            <ul className="studio-learn-grid">
              {examples.map((project) => (
                <li key={project.id}>
                  <article className="studio-learn-card">
                    <button type="button" className="studio-card-open" aria-label={project.name} onClick={() => openExample(project)}>
                      <ProjectPreview project={project} className="studio-learn-preview" />
                      <span className="studio-card-copy">
                        <span className="studio-learn-title">
                          <span className="studio-project-name">{project.name}</span>
                          <ClassBadge project={project} />
                        </span>
                        <span className="studio-project-meta studio-card-summary">{project.summary ?? projectDetail(project)}</span>
                      </span>
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {nav === "tutorials" ? (
          <section className="studio-learn-page" aria-label="Tutorials">
            <p className="studio-learn-count">
              {TUTORIALS.length} {TUTORIALS.length === 1 ? "tutorial" : "tutorials"}
            </p>
            <ul className="studio-learn-grid">
              {TUTORIALS.map((lesson) => (
                <li key={lesson.id}>
                  <article className={`studio-learn-card${startedTutorialId === lesson.id ? " is-started" : ""}`}>
                    <button
                      type="button"
                      className="studio-card-open"
                      aria-pressed={startedTutorialId === lesson.id}
                      onClick={() => {
                        setStartedTutorialId(lesson.id);
                        if (tutorialOpensModelSettings(lesson)) {
                          requestOpenSettings({ section: "3d-model" });
                        }
                      }}
                    >
                      <span className="studio-preview studio-learn-preview" data-kind="tutorial">
                        <img src={tutorialPreviewSrc(lesson)} alt="" />
                      </span>
                      <span className="studio-card-copy">
                        <span className="studio-project-name">{lesson.title}</span>
                        <span className="studio-project-meta studio-card-summary">{lesson.summary}</span>
                        {lesson.duration ? <span className="studio-project-meta">{lesson.duration}</span> : null}
                      </span>
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>}
    </section>
  );
}

function NavButton({
  id,
  label,
  active,
  Icon,
  onClick,
}: {
  id: string;
  label: string;
  active: boolean;
  Icon: typeof Box;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`studio-nav-item${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      data-nav={id}
      onClick={onClick}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );
}

function ClassBadge({ project }: { project: StudioProject }) {
  const cls = projectClass(project);
  const meta = projectClassMeta(project);
  const expand = meta.badge !== meta.label;
  return (
    <span className={`studio-badge studio-badge-${cls}`} title={meta.label}>
      {expand ? <span className="studio-sr">{meta.label}</span> : null}
      <span aria-hidden={expand || undefined}>{meta.badge}</span>
    </span>
  );
}

function ProjectRow({
  project,
  menuOpen,
  onOpen,
  onSetup,
  onMenu,
  onDelete,
}: {
  project: StudioProject;
  menuOpen: boolean;
  onOpen: () => void;
  onSetup?: () => void;
  onMenu: () => void;
  onDelete: () => void;
}) {
  const labels: Record<string, string> = { assembly: "Assembly", magnet: "Halbach array", fem: "FEM", gradients: "Gradient coils", rf: "RF coils", shimming: "Passive shimming" };
  const workspace = project.application === "acquisition" ? "Acquisition · MRZero" : project.application === "reconstruction" ? "Reconstruction" : labels[project.lastView ?? "assembly"] ?? projectClassMeta(project).label;
  return <tr>
    <td><button type="button" className="compact-project-open" aria-label={project.name} onClick={onOpen}><Box size={17} aria-hidden /><span>{project.name}</span></button></td>
    <td>{workspace}</td>
    <td><time dateTime={new Date(project.updatedAt).toISOString()} title={new Date(project.updatedAt).toLocaleString()}>{formatModifiedDate(project.updatedAt)}</time></td>
    <td><OverflowMenu onDelete={onDelete} project={project} menuOpen={menuOpen} onOpen={onOpen} onSetup={onSetup} onMenu={onMenu} /></td>
  </tr>;
}

function OverflowMenu({
  project,
  menuOpen,
  menuLabel = "Open",
  actionLabel,
  onOpen,
  onSetup,
  onMenu,
  onDelete,
}: {
  project: StudioProject;
  menuOpen: boolean;
  menuLabel?: string;
  actionLabel?: string;
  onOpen: () => void;
  onSetup?: () => void;
  onMenu: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="studio-card-menu" data-project-menu>
      <button
        type="button"
        className="studio-icon-btn"
        aria-label={actionLabel ?? `${project.name} actions`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          onMenu();
        }}
      >
        <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
      </button>
      {menuOpen ? (
        <div className="studio-menu" role="menu">
          <button type="button" role="menuitem" onClick={onOpen}>
            {menuLabel}
          </button>
          <button type="button" role="menuitem" className="studio-delete-action" onClick={onDelete}>Delete project</button>
          {onSetup ? (
            <button type="button" role="menuitem" onClick={onSetup}>
              Open setup
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProjectPreview({ project, className }: { project: StudioProject; className: string }) {
  return (
    <span className={`studio-preview ${className}`} data-kind={previewKind(project)}>
      <img src={projectPreviewSrc(project)} alt="" />
    </span>
  );
}

