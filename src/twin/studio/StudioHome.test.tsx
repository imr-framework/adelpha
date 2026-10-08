import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EngineeringStudio } from "../EngineeringStudio";
import { useEngineeringStore } from "../engineeringStore";
import { PLUGINS, saveNewProject } from "./library";
import { StudioHome } from "./StudioHome";

describe("StudioHome", () => {
  beforeEach(() => {
    useEngineeringStore.setState({ activeProject: null });
  });

  it("separates recent projects, examples, getting started, and a short tool row", () => {
    render(<StudioHome onOpenProject={vi.fn()} />);

    expect(screen.getByRole("region", { name: "Engineering Studio start" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Engineering Studio" })).toBeInTheDocument();
    expect(screen.getByText("Design, simulate, and refine your MRI system.")).toBeInTheDocument();
    expect(screen.queryByText("Adelpha", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent projects" })).toBeInTheDocument();
    expect(screen.getByText("No recent projects.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Example projects" })).toBeInTheDocument();
    expect(screen.queryByText("Sample")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Halbach 0\.5 T/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gradient coil stack/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cryostat envelope/ })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Getting started" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start tutorial" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Place a component/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Assign materials/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Inspect a field study/ })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Extend your studio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Field Mapper" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Shim Optimizer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Thermal Solver" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add RF Budget" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New project" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Open project" }).length).toBeGreaterThan(0);
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
    render(<StudioHome onOpenProject={onOpenProject} />);

    await user.click(screen.getAllByRole("button", { name: "New project" })[0]!);
    await user.type(screen.getByRole("textbox", { name: "Project name" }), "GRE study");
    await user.click(screen.getByRole("radio", { name: /Data acquisition/ }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(onOpenProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: "GRE study", application: "acquisition" }),
    );

    useEngineeringStore.getState().openProject(onOpenProject.mock.calls[0][0]);
    render(<EngineeringStudio />);
    expect(screen.getByRole("region", { name: "Acquisition" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "GRE study" })).toBeInTheDocument();
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

  it("opens a saved project from the open action", async () => {
    saveNewProject("Shim tray", { application: "acquisition" });
    const onOpenProject = vi.fn();
    const user = userEvent.setup();
    render(<StudioHome onOpenProject={onOpenProject} />);

    expect(screen.getByRole("button", { name: /Shim tray/ })).toBeInTheDocument();
    expect(screen.queryByText("No recent projects.")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Open project" })[0]!);
    const panel = screen.getByRole("region", { name: "Saved projects" });
    await user.click(within(panel).getByRole("button", { name: "Shim tray" }));

    expect(onOpenProject).toHaveBeenCalledWith(expect.objectContaining({ name: "Shim tray" }));
  });

  it("starts a tutorial and adds a tool", async () => {
    const user = userEvent.setup();
    render(<StudioHome onOpenProject={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Start tutorial" }));
    expect(screen.getByRole("button", { name: "Start tutorial" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /Assign materials/ }));
    expect(screen.getByRole("button", { name: /Assign materials/ })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Add Field Mapper" }));
    expect(screen.getByRole("button", { name: "Remove Field Mapper" })).toHaveAttribute("aria-pressed", "true");
  });

  it("expands the tool catalogue", async () => {
    const user = userEvent.setup();
    render(<StudioHome onOpenProject={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Browse all tools →" }));

    for (const plugin of PLUGINS) {
      expect(screen.getByRole("button", { name: `Add ${plugin.name}` })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Show fewer tools" })).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the studio workspace after an example is chosen", async () => {
    const user = userEvent.setup();
    render(<EngineeringStudio />);

    expect(screen.getByRole("region", { name: "Engineering Studio start" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Halbach 0\.5 T/ }));

    expect(screen.queryByRole("region", { name: "Engineering Studio start" })).not.toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Viewport navigation" })).toBeInTheDocument();
    expect(useEngineeringStore.getState().activeProject?.name).toBe("Halbach 0.5 T");

    await user.click(screen.getByRole("button", { name: "Gradient coils" }));
    expect(screen.getByRole("region", { name: "Gradient coils" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Y gradient/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("toolbar", { name: "Viewport navigation" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Assembly" }));
    expect(screen.getByRole("toolbar", { name: "Viewport navigation" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Passive shimming" }));
    expect(screen.getByRole("region", { name: "Passive shimming" })).toBeInTheDocument();
    expect(screen.getByLabelText("Diameter (mm)")).toHaveValue(152);
    expect(screen.queryByRole("toolbar", { name: "Viewport navigation" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Assembly" }));
    expect(screen.getByRole("toolbar", { name: "Viewport navigation" })).toBeInTheDocument();
  });
});
