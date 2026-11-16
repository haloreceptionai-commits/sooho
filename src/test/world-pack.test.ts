import { describe, expect, it } from "vitest";
import { backdropKeys, placeSlug, storyYear, worldPack, BACKDROP_PAINT_CAP } from "@/lib/world-pack";

describe("world pack (any topic)", () => {
  it("story year is the most spoken year, earliest on ties", () => {
    expect(storyYear(["In 1919 a tank burst.", "By 1925 the court ruled.", "1919 was cold."])).toBe(1919);
    expect(storyYear(["1904 marathon", "1900 games"])).toBe(1900);
    expect(storyYear(["no dates here"])).toBeNull();
  });
  it("slug ignores years and filler words so one place keeps one backdrop", () => {
    expect(placeSlug("Boston North End street, 1919")).toBe(placeSlug("Boston North End street"));
    expect(placeSlug("The dusty road near St. Louis")).toBe("dusty_road_st_louis");
  });
  it("picks at most three places, most used first, from unrelated topics alike", () => {
    const scenes = ["Moon crater, 1835", "New York newspaper office", "Moon crater", "Moon crater", "London street", "Paris cafe", "New York newspaper office"].map(location => ({ location }));
    const p = worldPack(scenes, ["In 1835 the Sun newspaper printed it."]);
    expect(p.year).toBe(1835);
    expect(p.places.map(x => x.slug)).toEqual(["moon_crater", "new_york_newspaper", "london_street"]);
    expect(p.places[1]?.indoor).toBe(true);
    expect(backdropKeys(p)).toHaveLength(6);
  });
  it("backdrop paintings are capped at 8 per video", () => expect(BACKDROP_PAINT_CAP).toBe(8));
});
