import {
  ArrowRight,
  BookOpen,
  Box,
  FileText,
  FolderOpen,
  GraduationCap,
  MoreHorizontal,
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
  featuredProject,
  formatModifiedDate,
  formatOpened,
  groupProjects,
  hasSetupDestination,
  lastOpenedAt,
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
import "./studioHome.css";

type StudioHomeProps = {
  onOpenProject: (project: StudioProject, options?: { view?: StudioProject["lastView"]; setup?: boolean }) => void;
};

type NavId = "projects" | "examples" | "tutorials";

const pageCopy: Record<NavId, { crumb: string; title: string; lede: string }> = {
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
  const nameId = useId();
  const errorId = useId();
  const searchId = useId();
  const openPanelId = useId();
  const sortId = useId();
  const openPanelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [ready, setReady] = useState(false);
  const [examples] = useState(seedProjects);
  const [mode, setMode] = useState<"idle" | "create" | "open">("idle");
  const [draft, setDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [application, setApplication] = useState<StudioApplication | null>(null);
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
  const featured = useMemo(() => featuredProject(userProjects), [userProjects]);
  const shown = useMemo(() => visibleProjects(projects, query, filter, sort), [filter, projects, query, sort]);
  const groups = useMemo(() => (sort === "name" ? [] : groupProjects(shown)), [shown, sort]);

  useEffect(() => {
    if (mode !== "open") return;
    openPanelRef.current?.querySelector<HTMLElement>("button, [tabindex]")?.focus();
  }, [mode]);

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

  function beginOpen() {
    setMode("open");
    setFormError(null);
    setOpenError(null);
  }

  function closeModes() {
    setMode("idle");
    setDraft("");
    setFormError(null);
    setApplication(null);
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
    const project = saveNewProject(name, { application });
    setProjects(readProjects());
    closeModes();
    onOpenProject(project);
  }

  function goTo(id: NavId) {
    setNav(id);
    setOpenMenuId(null);
    closeModes();
  }

  return (
    <section className="studio-home" aria-label="Engineering Studio start">
      <nav className="studio-nav" aria-label="Workspace">
        <p className="studio-nav-label">Workspace</p>
        <div className="studio-nav-list">
          <NavButton id="projects" label="Projects" active={nav === "projects"} Icon={Box} onClick={() => goTo("projects")} />
          <NavButton id="examples" label="Examples" active={nav === "examples"} Icon={BookOpen} onClick={() => goTo("examples")} />
          <NavButton id="tutorials" label="Tutorials" active={nav === "tutorials"} Icon={GraduationCap} onClick={() => goTo("tutorials")} />
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

      <div className="studio-home-main">
        <header className="studio-home-head">
          <div className="studio-home-intro">
            <p className="studio-crumb">Engineering Studio / {pageCopy[nav].crumb}</p>
            <h2>{pageCopy[nav].title}</h2>
            <p className="studio-lede">{pageCopy[nav].lede}</p>
          </div>
          {nav === "projects" ? (
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
                {userProjects.length === 0 ? (
                  <p>No saved projects to open.</p>
                ) : (
                  <ul>
                    {userProjects.map((project) => (
                      <li key={project.id}>
                        <button type="button" onClick={() => openSaved(project)}>
                          {project.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
          ) : null}
        </header>

        {nav === "projects" && mode === "create" ? (
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

        {openError ? (
          <p className="studio-open-error" role="alert">
            {openError}
          </p>
        ) : null}

        {nav === "projects" && featured ? (
          <article className="studio-resume" aria-label="Continue working">
            <span className="studio-resume-icon" aria-hidden>
              <FolderOpen size={18} strokeWidth={1.75} />
            </span>
            <div className="studio-resume-copy">
              <div className="studio-resume-title">
                <h3>{featured.name}</h3>
                <ClassBadge project={featured} />
              </div>
              <p className="studio-resume-meta">
                <span className="studio-resume-kicker">Continue working</span>
                <span>
                  {projectDetail(featured)} · {formatOpened(lastOpenedAt(featured))}
                </span>
              </p>
            </div>
            <div className="studio-resume-actions">
              <button type="button" className="studio-new-btn" onClick={() => openSaved(featured)}>
                Resume project
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
              </button>
              <OverflowMenu
                project={featured}
                actionLabel={`${featured.name} resume actions`}
                menuOpen={openMenuId === `resume-${featured.id}`}
                onOpen={() => openSaved(featured)}
                onSetup={
                  hasSetupDestination(featured)
                    ? () => openSaved(featured, { view: setupViewFor(featured), setup: true })
                    : undefined
                }
                onMenu={() => setOpenMenuId((id) => (id === `resume-${featured.id}` ? null : `resume-${featured.id}`))}
              />
            </div>
          </article>
        ) : null}

        {nav === "projects" ? (
        <div className="studio-search">
          <Search size={16} strokeWidth={1.75} aria-hidden />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={query}
            aria-label="Search projects"
            placeholder="Search projects by name, class, or description…"
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
        ) : null}

        {nav === "projects" ? (
        <section className="studio-collection" aria-labelledby="studio-projects-heading">
          <div className="studio-toolbar">
            <div className="studio-toolbar-count">
              <h3 id="studio-projects-heading">Projects</h3>
              <p>{ready ? `${shown.length} ${shown.length === 1 ? "project" : "projects"}` : "Loading projects…"}</p>
            </div>
            <div className="studio-filters" role="tablist" aria-label="Project class">
              {PROJECT_CLASS_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-label={item.label}
                  aria-selected={filter === item.id}
                  className={filter === item.id ? "is-active" : undefined}
                  onClick={() => setFilter(item.id)}
                >
                  {item.badge}
                </button>
              ))}
            </div>
            <div className="studio-toolbar-tools">
              <label className="studio-sort" htmlFor={sortId}>
                <span className="studio-sr">Sort projects</span>
                <select id={sortId} value={sort} onChange={(event) => setSort(event.target.value as StudioSort)}>
                  <option value="modified">Last modified</option>
                  <option value="name">Name</option>
                </select>
              </label>
            </div>
          </div>

          {!ready ? (
            <p className="studio-empty-copy" role="status">
              Loading projects…
            </p>
          ) : userProjects.length === 0 ? (
            <div className="studio-empty">
              <p>No projects yet. Start a new study, open a saved one, or copy an example from Examples.</p>
              <div className="studio-action-row">
                <button type="button" className="studio-new-btn" onClick={beginCreate}>
                  <Plus size={16} strokeWidth={2} aria-hidden />
                  New project
                </button>
                <button type="button" className="studio-ghost" onClick={beginOpen}>
                  <FolderOpen size={16} strokeWidth={1.75} aria-hidden />
                  Open project
                </button>
              </div>
            </div>
          ) : shown.length === 0 ? (
            <div className="studio-empty">
              <p>No projects match that search.</p>
              <button type="button" className="studio-ghost" onClick={() => setQuery("")}>
                Show all projects
              </button>
            </div>
          ) : sort === "name" ? (
            <div className="studio-grouped">
              <ul className="studio-project-rows">
                {shown.map((project) => (
                  <li key={project.id}>
                    <ProjectRow
                      project={project}
                      menuOpen={openMenuId === project.id}
                      onOpen={() => openSaved(project)}
                      onSetup={
                        hasSetupDestination(project)
                          ? () => openSaved(project, { view: setupViewFor(project), setup: true })
                          : undefined
                      }
                      onMenu={() => setOpenMenuId((id) => (id === project.id ? null : project.id))}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="studio-grouped">
              {groups.map((group) => (
                <section key={group.id} className="studio-group" aria-labelledby={`studio-group-${group.id}`}>
                  <h4 id={`studio-group-${group.id}`} className="studio-group-label">
                    {group.label}
                  </h4>
                  <ul className="studio-project-rows">
                    {group.projects.map((project) => (
                      <li key={project.id}>
                        <ProjectRow
                          project={project}
                          menuOpen={openMenuId === project.id}
                          onOpen={() => openSaved(project)}
                          onSetup={
                            hasSetupDestination(project)
                              ? () => openSaved(project, { view: setupViewFor(project), setup: true })
                              : undefined
                          }
                          onMenu={() => setOpenMenuId((id) => (id === project.id ? null : project.id))}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
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
      </div>
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
}: {
  project: StudioProject;
  menuOpen: boolean;
  onOpen: () => void;
  onSetup?: () => void;
  onMenu: () => void;
}) {
  const detail = projectDetail(project);
  return (
    <article className="studio-row">
      <button type="button" className="studio-row-open" aria-label={project.name} onClick={onOpen}>
        <span className="studio-row-icon" aria-hidden>
          <Box size={16} strokeWidth={1.75} />
        </span>
        <span className="studio-row-main">
          <span className="studio-project-name">{project.name}</span>
          <ClassBadge project={project} />
        </span>
        <span className="studio-row-detail studio-project-meta">{detail || "—"}</span>
        <time className="studio-row-date studio-project-meta" dateTime={new Date(project.updatedAt).toISOString()}>
          {formatModifiedDate(project.updatedAt)}
        </time>
      </button>
      <button type="button" className="studio-icon-btn studio-row-go" aria-label={`Open ${project.name}`} onClick={onOpen}>
        <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <OverflowMenu project={project} menuOpen={menuOpen} onOpen={onOpen} onSetup={onSetup} onMenu={onMenu} />
    </article>
  );
}

function OverflowMenu({
  project,
  menuOpen,
  menuLabel = "Open",
  actionLabel,
  onOpen,
  onSetup,
  onMenu,
}: {
  project: StudioProject;
  menuOpen: boolean;
  menuLabel?: string;
  actionLabel?: string;
  onOpen: () => void;
  onSetup?: () => void;
  onMenu: () => void;
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

