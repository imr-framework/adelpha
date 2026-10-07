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

    expect(onOpenProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Shim tray", kind: "user" }),
    );
  });

  it("opens a saved project from the open action", async () => {
    saveNewProject("Shim tray");
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
  });
});
