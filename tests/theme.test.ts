import { describe, expect, it } from "vitest";
import { parseThemeChoice } from "../src/theme.ts";

describe("parseThemeChoice", () => {
  it("keeps a saved Light or Dark choice", () => {
    expect(parseThemeChoice("light")).toBe("light");
    expect(parseThemeChoice("dark")).toBe("dark");
  });

  it("follows the device when nothing, or something unexpected, is saved", () => {
    expect(parseThemeChoice(null)).toBe("system");
    expect(parseThemeChoice("")).toBe("system");
    expect(parseThemeChoice("Dark")).toBe("system");
    expect(parseThemeChoice("<script>")).toBe("system");
  });
});
