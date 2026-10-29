import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("ui test environment", () => {
  it("renders React into jsdom with jest-dom matchers", () => {
    render(<button type="button">Add node</button>);
    expect(screen.getByRole("button", { name: "Add node" })).toBeInTheDocument();
  });
});
