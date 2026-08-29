import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConstraintsDisplay } from "../ConstraintsDisplay";

describe("ConstraintsDisplay", () => {
  it("expands honors and stopper shorthands", () => {
    const { unmount } = render(
      <ConstraintsDisplay constraints="2o3 in hearts" />,
    );
    expect(
      screen.getByText("at least two of the top three honors in hearts"),
    ).toBeInTheDocument();
    unmount();

    render(<ConstraintsDisplay constraints="3o5" />);
    expect(
      screen.getByText("at least three of the top five honors"),
    ).toBeInTheDocument();
  });

  it("expands ace and king counts", () => {
    const { unmount } = render(<ConstraintsDisplay constraints="aces(1)" />);
    expect(screen.getByText("1 ace")).toBeInTheDocument();
    unmount();

    render(<ConstraintsDisplay constraints="kings(2)" />);
    expect(screen.getByText("2 kings")).toBeInTheDocument();
  });

  it("renders nothing when constraints are undefined or empty", () => {
    const { container } = render(<ConstraintsDisplay />);
    expect(container.firstChild).toBeNull();
  });

  it("renders suit symbols with proper colors", () => {
    render(<ConstraintsDisplay constraints="12-21 hcp, 5+H" />);
    expect(screen.getByText("12-21 hcp, 5+")).toBeDefined();
    const heartSymbol = screen.getByText("\u2665");
    expect(heartSymbol.className).toContain("text-red-600");
  });

  it("renders multiple suits in balanced hand descriptions", () => {
    render(
      <ConstraintsDisplay constraints="15-17 hcp, 2-5C 2-5D 2-5H 2-5S NotrumpSystemsOn" />,
    );
    expect(screen.getByText("\u2663").className).toContain("text-blue-900");
    expect(screen.getByText("\u2666").className).toContain("text-orange-600");
    expect(screen.getByText("\u2665").className).toContain("text-red-600");
    expect(screen.getByText("\u2660").className).toContain("text-black");
    expect(
      screen.getByText("NotrumpSystemsOn", { exact: false }),
    ).toBeDefined();
  });
});
