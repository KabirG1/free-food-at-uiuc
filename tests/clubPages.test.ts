import { describe, expect, it } from "vitest";
import { instagramHandle, parseClubPages } from "../src/clubPages.ts";

describe("instagramHandle", () => {
  it("accepts a handle typed with or without @, or a pasted profile link", () => {
    expect(instagramHandle("chessclub")).toBe("chessclub");
    expect(instagramHandle(" @chess.club_uiuc ")).toBe("chess.club_uiuc");
    expect(instagramHandle("https://www.instagram.com/chessclub/")).toBe("chessclub");
    expect(instagramHandle("instagram.com/chessclub?igsh=abc")).toBe("chessclub");
  });

  it("is empty when nothing is typed, and refuses anything that isn't a handle", () => {
    expect(instagramHandle("  ")).toBe("");
    expect(instagramHandle("chess club")).toBeNull();
    expect(instagramHandle("https://evil.com/chessclub")).toBeNull();
    expect(instagramHandle("a".repeat(31))).toBeNull();
  });
});

describe("parseClubPages", () => {
  it("drops links that aren't safe to show and rows without a club", () => {
    const pages = parseClubPages([
      { club: "Chess Club", description: "We play chess.", instagram: "chessclub", website: "javascript:alert(1)" },
      { club: "", description: "", instagram: "", website: "" },
      "nonsense",
    ]);
    expect(pages).toEqual([{ club: "Chess Club", description: "We play chess.", instagram: "chessclub", website: "" }]);
  });
});
