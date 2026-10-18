import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FemStudio } from "./FemStudio";
vi.mock("./ElmerStepStudio", () => ({ ElmerStepStudio: () => <div>STEP workflow</div> }));
beforeEach(() => sessionStorage.clear());
it("opens STEP directly even when an older project selected assembly geometry", () => {
  sessionStorage.setItem("fem-source-test", "assembly");
  render(<FemStudio projectId="test" projectName="FEM" />);
  expect(screen.getByText("STEP workflow")).toBeInTheDocument();
  expect(screen.queryByText("Use assembly")).not.toBeInTheDocument();
});
