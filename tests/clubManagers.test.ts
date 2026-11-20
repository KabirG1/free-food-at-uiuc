import { describe, expect, it } from "vitest";
import { isIllinoisEmail, roleText, type ManagerRequest } from "../src/clubManagers.ts";

describe("isIllinoisEmail", () => {
  it("accepts an Illinois address, whatever the capitals or spaces around it", () => {
    expect(isIllinoisEmail("netid@illinois.edu")).toBe(true);
    expect(isIllinoisEmail("  NetID@Illinois.EDU ")).toBe(true);
  });

  it("refuses other addresses, so a manager can't invite someone who can't sign in", () => {
    expect(isIllinoisEmail("someone@gmail.com")).toBe(false);
    expect(isIllinoisEmail("netid@illinois.edu.evil.com")).toBe(false);
    expect(isIllinoisEmail("net id@illinois.edu")).toBe(false);
    expect(isIllinoisEmail("@illinois.edu")).toBe(false);
  });
});

describe("roleText", () => {
  const manager: ManagerRequest = { id: "1", email: "a@illinois.edu", club: "Chess Club", role: "President", status: "approved", requested_at: "", added_by_email: null };

  it("shows the role an officer gave, or Manager for someone who joined by invitation", () => {
    expect(roleText(manager)).toBe("President");
    expect(roleText({ ...manager, role: "", added_by_email: "b@illinois.edu" })).toBe("Manager");
  });
});
