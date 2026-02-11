import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AboutFooter } from "../AboutFooter";

describe("AboutFooter", () => {
  it("renders the heading", () => {
    render(<AboutFooter />);
    expect(
      screen.getByRole("heading", { name: /about saycbridge\.com/i })
    ).toBeInTheDocument();
  });

  it("renders 'Happy bidding!' text", () => {
    render(<AboutFooter />);
    expect(screen.getByText(/happy bidding/i)).toBeInTheDocument();
  });

  it("links to the SAYC Wikipedia article", () => {
    render(<AboutFooter />);
    const link = screen.getByRole("link", {
      name: /standard american yellow card/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Standard_American"
    );
  });

  it("links to the ACBL pamphlet", () => {
    render(<AboutFooter />);
    const link = screen.getByRole("link", { name: /acbl pamphlet/i });
    expect(link).toHaveAttribute(
      "href",
      "http://web2.acbl.org/documentlibrary/play/SP3%20(bk)%20single%20pages.pdf"
    );
  });

  it("links to the book on Amazon", () => {
    render(<AboutFooter />);
    const link = screen.getByRole("link", {
      name: /standard bidding with sayc/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://www.amazon.com/gp/product/1897106033"
    );
  });

  it("links to the email address", () => {
    render(<AboutFooter />);
    const link = screen.getByRole("link", { name: /email/i });
    expect(link).toHaveAttribute("href", "mailto:contact@saycbridge.com");
  });

  it("links to the GitHub repository", () => {
    render(<AboutFooter />);
    const link = screen.getByRole("link", {
      name: /source code to saycbridge\.com/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/eseidel/yarborough"
    );
  });

  it("links to twitter", () => {
    render(<AboutFooter />);
    const link = screen.getByRole("link", { name: /twitter/i });
    expect(link).toHaveAttribute(
      "href",
      "https://twitter.com/SAYCBridge"
    );
  });

  it("opens external links in new tabs", () => {
    render(<AboutFooter />);
    const externalLinks = screen
      .getAllByRole("link")
      .filter((link) => !link.getAttribute("href")?.startsWith("mailto:"));
    for (const link of externalLinks) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});
