import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EngineeringStudio } from "../EngineeringStudio";
import { useEngineeringStore } from "../engineeringStore";
import { requestOpenSettings } from "../settingsOpen";
import { saveNewProject } from "./library";
import { StudioHome } from "./StudioHome";

vi.mock("../settingsOpen", () => ({
  requestOpenSettings: vi.fn(),
}));

describe("StudioHome", () => {
  beforeEach(() => {
    useEngineeringStore.setState({ activeProject: null, hardwareView: "assembly", setupIntent: false });
    vi.mocked(requestOpenSettings).mockReset();
  });

  it("renders the projects workspace, navigation, and supporting examples", () => {
    render(<StudioHome onOpenProject={vi.fn()} />);

    expect(screen.getByRole("region", { name: "Engineering Studio start" })).toBeInTheDocument();
    expect(screen.getByText("Engineering Studio / Projects")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your engineering workspace" })).toBeInTheDocument();
    expect(screen.getByText("Design, simulate, and refine your MRI system.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Projects" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Examples" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tutorials" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Documentation" })).toHaveAttribute(
      "href",
      "https://imr-framework.github.io/adelpha/",
    );
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Continue working" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByText(/No projects yet/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Examples" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Tutorials" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Explore and learn" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search projects" })).toHaveAttribute(
      "placeholder",
      "Search projects by name, class, or description…",
    );
    expect(screen.getAllByRole("button", { name: "New project" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Open project" }).length).toBeGreaterThan(0);
  });

  it("opens Examples and Tutorials from the workspace nav", async () => {
    const user = userEvent.setup();
    render(<StudioHome onOpenProject={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Examples" }));
    expect(screen.getByRole("button", { name: "Examples" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Engineering Studio / Examples")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Examples" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Search projects" })).not.toBeInTheDocument();
    const examples = screen.getByRole("region", { name: "Examples" });
    expect(within(examples).getByText("3 examples")).toBeInTheDocument();
    expect(within(examples).getByRole("button", { name: /Halbach 0\.5 T/ })).toBeInTheDocument();
    expect(within(examples).getByText("Magnet")).toBeInTheDocument();
    expect(within(examples).getByRole("button", { name: /Gradient coil stack/ })).toBeInTheDocument();
    expect(within(examples).getByText("Gradient")).toBeInTheDocument();
    expect(within(examples).getByRole("button", { name: /Cryostat envelope/ })).toBeInTheDocument();
    expect(within(examples).getByText("Assembly")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    expect(screen.getByRole("button", { name: "Tutorials" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("region", { name: "Examples" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tutorials" })).toBeInTheDocument();
    expect(screen.getByText("6 tutorials")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Make a Halbach digital twin/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Set the Delta digital twin/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Navigate the studio/ })).toBeInTheDocument();
  });

  it("creates a named project and opens it", async () => {
    const onOpenProject = vi.fn();
    const user = userEvent.setup();
    render(<StudioHome onOpenProject={onOpenProject} />);

    await user.click(screen.getAllByRole("button", { name: "New project" })[0]!);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give the project a name.");
    expect(onOpenProject).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "Project name" }), "Shim tray");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose an application.");

    await user.click(screen.getByRole("radio", { name: /Hardware/ }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(onOpenProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Shim tray",
        kind: "user",
        application: "hardware",
        discipline: "Hardware",
      }),
    );
  });

  it("opens an acquisition project into the acquisition studio", async () => {
    const onOpenProject = vi.fn();
    const user = userEvent.setup();
    const view = render(<StudioHome onOpenProject={onOpenProject} />);

    await user.click(screen.getAllByRole("button", { name: "New project" })[0]!);
    await user.type(screen.getByRole("textbox", { name: "Project name" }), "GRE study");
    await user.click(screen.getByRole("radio", { name: /Data acquisition/ }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(onOpenProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: "GRE study", application: "acquisition" }),
    );

    view.unmount();
    useEngineeringStore.getState().openProject(onOpenProject.mock.calls[0][0]);
    render(<EngineeringStudio />);
    const acquisition = screen.getByRole("region", { name: "Acquisition" });
    expect(acquisition).toBeInTheDocument();
    expect(within(acquisition).getByRole("heading", { name: "GRE study" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Viewport navigation" })).not.toBeInTheDocument();
  });

  it("closes the open project and returns to the start page", async () => {
    const user = userEvent.setup();
    useEngineeringStore.setState({
      activeProject: {
        id: "gre",
        name: "GRE study",
        application: "acquisition",
      },
    });
    render(<EngineeringStudio />);

    await user.click(screen.getByRole("button", { name: "Close project" }));

    expect(screen.getByRole("region", { name: "Engineering Studio start" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Acquisition" })).not.toBeInTheDocument();
    expect(useEngineeringStore.getState().activeProject).toBeNull();
  });

  it("opens a reconstruction project into the reconstruction studio", () => {
    useEngineeringStore.setState({
      activeProject: {
        id: "recon",
        name: "SENSE study",
        application: "reconstruction",
      },
    });
    render(<EngineeringStudio />);
    expect(screen.getByRole("region", { name: "Reconstruction" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cartesian FFT/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("toolbar", { name: "Viewport navigation" })).not.toBeInTheDocument();
  });

  it("opens a saved project from the open action and resume banner", async () => {
    saveNewProject("Shim tray", { application: "acquisition" });
    const onOpenProject = vi.fn();
    const user = userEvent.setup();
    render(<StudioHome onOpenProject={onOpenProject} />);

    const resume = screen.getByRole("article", { name: "Continue working" });
    expect(resume).toHaveTextContent("Shim tray");
    expect(resume).toHaveTextContent("Acq");
    expect(resume).toHaveTextContent("Acquisition simulation");
    expect(resume.querySelector("img")).toBeNull();
    expect(resume).toHaveTextContent("MRzero");
    expect(screen.queryByText(/No projects yet/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resume project" }));
    expect(onOpenProject).toHaveBeenCalledWith(expect.objectContaining({ name: "Shim tray" }), undefined);

    onOpenProject.mockClear();
    await user.click(screen.getAllByRole("button", { name: "Open project" })[0]!);
    const panel = screen.getByRole("region", { name: "Saved projects" });
    await user.click(within(panel).getByRole("button", { name: "Shim tray" }));
    expect(onOpenProject).toHaveBeenCalledWith(expect.objectContaining({ name: "Shim tray" }), undefined);
  });

  it("filters, searches, and sorts the grouped project list", async () => {
    saveNewProject("Yoke field", { application: "hardware" });
    saveNewProject("Low-field spin echo", { application: "acquisition" });
    const user = userEvent.setup();
    render(<StudioHome onOpenProject={vi.fn()} />);

    expect(screen.getByText("2 projects")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Grid view" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yoke field" }).querySelector("img")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Acquisition" }));
    expect(screen.getByRole("button", { name: "Low-field spin echo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yoke field" })).not.toBeInTheDocument();
    expect(screen.getByText("1 project")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "All" }));
    await user.type(screen.getByRole("searchbox", { name: "Search projects" }), "yoke");
    expect(screen.getByRole("button", { name: "Yoke field" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Low-field spin echo" })).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Search projects" }));
    await user.type(screen.getByRole("searchbox", { name: "Search projects" }), "acq");
    expect(screen.getByRole("button", { name: "Low-field spin echo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yoke field" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await user.type(screen.getByRole("searchbox", { name: "Search projects" }), "missing");
    expect(screen.getByText("No projects match that search.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all projects" }));

    await user.selectOptions(screen.getByLabelText("Sort projects"), "name");
    expect(screen.queryByRole("heading", { name: "Today" })).not.toBeInTheDocument();
    const names = screen.getAllByRole("button", { name: /^(Yoke field|Low-field spin echo)$/ }).map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Low-field spin echo", "Yoke field"]);
  });

  it("keeps card open and overflow actions separate", async () => {
    saveNewProject("Delta v2", { application: "hardware" });
    const onOpenProject = vi.fn();
    const user = userEvent.setup();
    render(<StudioHome onOpenProject={onOpenProject} />);

    await user.click(screen.getByRole("button", { name: "Delta v2 actions" }));
    expect(onOpenProject).not.toHaveBeenCalled();
    expect(screen.getByRole("menuitem", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Open setup" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Open setup" }));
    expect(onOpenProject).toHaveBeenCalledWith(expect.objectContaining({ name: "Delta v2" }), {
      view: "magnet",
      setup: true,
    });
  });

  it("focuses search with the command shortcut and opens settings", async () => {
    const user = userEvent.setup();
    render(<StudioHome onOpenProject={vi.fn()} />);
    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByRole("searchbox", { name: "Search projects" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(requestOpenSettings).toHaveBeenCalled();
  });

  it("starts a tutorial from the learn list", async () => {
    const user = userEvent.setup();
    render(<StudioHome onOpenProject={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    await user.click(screen.getByRole("button", { name: /Navigate the studio/ }));
    expect(screen.getByRole("button", { name: /Navigate the studio/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens 3D Model settings from the digital twin tutorials", async () => {
    const user = userEvent.setup();
    render(<StudioHome onOpenProject={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Tutorials" }));
    expect(screen.getByRole("region", { name: "Tutorials" }).querySelector('img[src="/project_previews/make_halbach_dt.png"]')).toBeTruthy();
    expect(screen.getByRole("region", { name: "Tutorials" }).querySelector('img[src="/project_previews/set_delta_dt.png"]')).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Make a Halbach digital twin/ }));
    expect(requestOpenSettings).toHaveBeenCalledWith({ section: "3d-model" });
    await user.click(screen.getByRole("button", { name: /Set the Delta digital twin/ }));
    expect(requestOpenSettings).toHaveBeenCalledWith({ section: "3d-model" });
  });

  it("opens the studio workspace after an example is chosen", async () => {
    const user = userEvent.setup();
    render(<EngineeringStudio />);

    expect(screen.getByRole("region", { name: "Engineering Studio start" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Examples" }));
    await user.click(
      within(screen.getByRole("region", { name: "Examples" })).getByRole("button", { name: /Halbach 0\.5 T/ }),
    );

    expect(screen.queryByRole("region", { name: "Engineering Studio start" })).not.toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Viewport navigation" })).toBeInTheDocument();
    expect(useEngineeringStore.getState().activeProject?.name).toBe("Halbach 0.5 T");
    expect(useEngineeringStore.getState().activeProject?.id).not.toBe("sample-halbach");

    await user.click(screen.getByRole("button", { name: "Gradient coils" }));
    expect(screen.getByRole("region", { name: "Gradient coils" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Y gradient/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("toolbar", { name: "Viewport navigation" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Assembly" }));
    expect(screen.getByRole("toolbar", { name: "Viewport navigation" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Passive shimming" }));
    expect(screen.getByRole("region", { name: "Passive shimming" })).toBeInTheDocument();
    expect(screen.getByLabelText("Diameter (mm)")).toHaveValue(203.3);
    expect(screen.getByLabelText("Bottom (mm)")).toHaveValue(-48.5);
    expect(screen.getByLabelText("Top (mm)")).toHaveValue(48.5);
    expect(screen.queryByRole("toolbar", { name: "Viewport navigation" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Assembly" }));
    expect(screen.getByRole("toolbar", { name: "Viewport navigation" })).toBeInTheDocument();
  });
});
