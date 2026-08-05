import { describe, expect, it } from "vitest";
import jokes from "./jokes.json";

describe("bundled joke dataset", () => {
  it("contains the pinned Official Joke API snapshot", () => {
    expect(jokes).toHaveLength(451);
  });

  it("contains complete joke text for every entry", () => {
    expect(jokes.every(({ setup, punchline }) => setup.trim() !== "" && punchline.trim() !== "")).toBe(true);
  });
});
