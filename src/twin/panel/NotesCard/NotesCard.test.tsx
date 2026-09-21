import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SystemState } from "../../dtamTypes";
import { NotesCard } from "./NotesCard";

describe("NotesCard", () => {
  it("renders nothing when there are no notes", () => {
    const { container } = render(<NotesCard systemState={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders one list item per note", () => {
    const { container } = render(
      <NotesCard systemState={{ notes: ["first", "second"] } as SystemState} />,
    );
    expect(container.querySelectorAll(".notes-list li")).toHaveLength(2);
  });
});
