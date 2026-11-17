import { describe, expect, it } from "vitest";
import { essentialFor, liftDressing, placeSpec, requirePlaces, PLACE_DRESSING, PLACE_TERRAINS } from "@/lib/place-spec";
import { cartoonScene } from "@/lib/cartoon-job";

const pass = { terrain: "mountain_pass", time: "night", weather: "clear", dressing: [{ id: "ox_burning", count: 8 }] };

describe("Advanced place spec", () => {
  it("offers the history place modules and Hannibal props", () => {
    for (const t of ["mountain_pass", "valley", "plain", "river_crossing", "camp"]) expect(PLACE_TERRAINS).toContain(t);
    for (const d of ["ox", "ox_burning", "torch", "spear", "shield", "tent", "banner"]) expect(PLACE_DRESSING).toContain(d);
  });
  it("rejects undrawable places and props", () => {
    expect(placeSpec.safeParse({ ...pass, terrain: "aqueduct" }).success).toBe(false);
    expect(placeSpec.safeParse({ ...pass, dressing: [{ id: "war_elephant", count: 1 }] }).success).toBe(false);
    expect(placeSpec.safeParse({ ...pass, dressing: [{ id: "boat", count: 1 }] }).success).toBe(false);
  });
  it("repairs a scene with no buildable place instead of failing the paid video", () => {
    const r = requirePlaces([{ place: pass }, {}, { place: { ...pass, time: "night", dressing: [{ id: "war_elephant", count: 1 }, { id: "torch", count: 1 }] } }]);
    expect(r[1]).toEqual({ terrain: "plain", time: "day", weather: "clear", dressing: [] });
    expect(r[2]!.time).toBe("night");
    expect(r[2]!.dressing).toEqual([{ id: "torch", count: 1 }]);
  });
  it("turns drawable object phrases into 3D dressing instead of painted cards", () => {
    const r = liftDressing({ ...pass, dressing: [] }, [{ id: "oxen", phrase: "a herd of oxen with burning torches on their horns" }, { id: "tank", phrase: "steel molasses tank" }]);
    expect(r.objects.map(o => o.id)).toEqual(["tank"]);
    expect(r.place.dressing[0]).toEqual({ id: "ox_burning", count: 6 });
  });
  it("old saved scenes without a place still parse", () => {
    const base = { world: "landscape", light: "day", action: "idle", expression: "neutral", actor: "a", wide: true };
    expect(cartoonScene.safeParse(base).success).toBe(true);
    expect(cartoonScene.safeParse({ ...base, place: pass }).success).toBe(true);
  });
});

describe("Essential props", () => {
  it("maps everyday words to an exact model or assembly and leaves ambiguous phrases to the fuzzy search", () => {
    expect(essentialFor("a smartphone")).toMatchObject({ asm: { name: "smartphone" } });
    expect(essentialFor("a hot coffee")).toMatchObject({ lib: "food-kit/cup-coffee" });
    expect(essentialFor("oil can")).toBeUndefined();
    expect(essentialFor("staff meeting")).toBeUndefined();
  });
});
