import { describe, expect, it } from "vitest";
import { navItems } from "../src/layout.ts";

function currentLabel(pathname: string): string | undefined {
  return navItems(pathname).find((item) => item.current)?.label;
}

describe("navItems", () => {
  it("marks Today on the home page, with or without index.html", () => {
    expect(currentLabel("/free-food-at-uiuc/")).toBe("Today");
    expect(currentLabel("/free-food-at-uiuc/index.html")).toBe("Today");
  });

  it("marks the FAQ and Contact pages, with or without .html", () => {
    expect(currentLabel("/free-food-at-uiuc/faq.html")).toBe("FAQ");
    expect(currentLabel("/free-food-at-uiuc/contact")).toBe("Contact");
  });

  it("uses relative links so they work under the GitHub Pages folder", () => {
    expect(navItems("/").map((item) => item.href)).toEqual(["./", "./calendar.html", "./faq.html", "./contact.html"]);
  });
});
