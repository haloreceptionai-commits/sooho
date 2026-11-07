import { describe, expect, it } from "vitest";
import { availableTopics, topicKey, topicPage, topicUnavailable, type FactTopic } from "@/lib/topics";

const library: FactTopic[] = [
  { id: "rail", title: "Why Railroad Tracks Have Gaps", archetype: "paradox", fact: "Gaps allow rails to expand in heat.", source: "https://www.britannica.com/technology/railroad" },
  { id: "oil", title: "Why Sailors Carried Storm Oil", archetype: "object", fact: "Oil can damp small waves.", source: "https://oceanservice.noaa.gov/" },
];
describe("unused fact suggestions", () => {
  it("never suggests a completed video topic", () => {
    expect(availableTopics(library, [{ topic: library[0].title, status: "done" }]).map((t) => t.id)).toEqual(["oil"]);
  });
  it("blocks a completed topic even when its saved title changed but its ID stayed", () => {
    expect(topicUnavailable("A new heading", "rail", [{ topic: "Old heading", topicId: "rail", status: "done" }])).toBe(true);
  });
  it("blocks repeats while generating but lets failed topics be retried", () => {
    expect(availableTopics(library, [{ topic: library[0].title, status: "running" }])).toHaveLength(1);
    expect(availableTopics(library, [{ topic: library[0].title, status: "failed" }])).toHaveLength(2);
  });
  it("recognizes punctuation, case and spacing changes", () => {
    expect(topicKey("WHY   Railroad tracks have gaps?!")).toBe(topicKey(library[0].title));
  });
  it("searches factual premises and categories", () => {
    expect(availableTopics(library, [], "paradox", "heat").map((t) => t.id)).toEqual(["rail"]);
    expect(availableTopics(library, [], "object", "heat")).toEqual([]);
  });
  it("shows every page including a partial final page before wrapping", () => {
    const topics = Array.from({ length: 17 }, (_, i) => ({ ...library[0], id: String(i) }));
    expect(topicPage(topics, 2).map((t) => t.id)).toEqual(["16"]);
    expect(topicPage(topics, 3).map((t) => t.id)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
  });
});