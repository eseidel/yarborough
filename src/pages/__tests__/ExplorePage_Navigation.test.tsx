import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ExplorePage } from "../ExplorePage";
import * as engine from "../../bridge/engine";

vi.mock("../../bridge/engine", () => ({
  getCallInterpretations: vi.fn(),
}));

describe("ExplorePage Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(engine.getCallInterpretations).mockResolvedValue([
      {
        call: { type: "bid", level: 1, strain: "C" },
        ruleName: "1C",
        description: "12+ HCP, 3+ clubs",
      },
    ]);
  });

  it("updates state when navigating back and forth", async () => {
    const routes = [
      {
        path: "/explore/:exploreId",
        element: <ExplorePage />,
      },
      {
        path: "/explore",
        element: <ExplorePage />,
      },
    ];

    const router = createMemoryRouter(routes, {
      initialEntries: ["/explore/1"],
    });

    render(<RouterProvider router={router} />);

    // Initial load
    await waitFor(() => {
      expect(engine.getCallInterpretations).toHaveBeenCalledWith(
        "",
        "N",
        "None",
      );
    });

    // Select 1C (this triggers navigate("/explore/1:1C"))
    await waitFor(() => screen.getByText("1C"));
    fireEvent.click(screen.getByText("1C"));

    await waitFor(() => {
      expect(engine.getCallInterpretations).toHaveBeenCalledWith(
        "1C",
        "N",
        "None",
      );
    });
    expect(router.state.location.pathname).toBe("/explore/1:1C");

    // Go back
    await act(async () => {
      router.navigate(-1);
    });

    await waitFor(() => {
      expect(engine.getCallInterpretations).toHaveBeenCalledWith(
        "",
        "N",
        "None",
      );
    });
    expect(router.state.location.pathname).toBe("/explore/1");
  });

  it("keeps the same board number when clearing history", async () => {
    const routes = [
      {
        path: "/explore/:exploreId",
        element: <ExplorePage />,
      },
      {
        path: "/explore",
        element: <ExplorePage />,
      },
    ];

    // Start with board number 5 and some calls
    const router = createMemoryRouter(routes, {
      initialEntries: ["/explore/5:1C,1D"],
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => screen.getByLabelText(/clear history/i));

    // Clear history
    fireEvent.click(screen.getByLabelText(/clear history/i));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/explore/5");
    });
  });
});
