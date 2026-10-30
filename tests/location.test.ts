import { describe, expect, it } from "vitest";
import { isPrivateLocation, mapLink } from "../src/location.ts";

describe("mapLink", () => {
  it("links a campus building to a Google Maps search near campus", () => {
    expect(mapLink("Illini Union 210")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Illini%20Union%20210%2C%20Urbana-Champaign%2C%20IL",
    );
  });

  it("gives no link for hidden, online, or missing locations", () => {
    expect(mapLink("Private Location (sign in to display)")).toBeNull();
    expect(mapLink("Zoom")).toBeNull();
    expect(mapLink("Location not listed")).toBeNull();
    expect(mapLink("  ")).toBeNull();
  });
});

describe("isPrivateLocation", () => {
  it("recognizes OneIllinois' hidden-location text", () => {
    expect(isPrivateLocation("Private Location (sign in to display)")).toBe(true);
    expect(isPrivateLocation("ECEB 1002")).toBe(false);
  });
});
