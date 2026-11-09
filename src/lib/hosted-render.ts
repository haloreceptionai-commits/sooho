import { z } from "zod";
import type { SeedanceCheckpoint } from "@/lib/pipeline";

export const RENDER_ACTOR = "osLa4h1pD9aFfZBhQ";
export const RENDER_LIFETIME_MS = 30 * 60_000;
export const ACTIVE_RENDER_STATES = ["submitting", "running", "saving"];
export const hostedActive = (status?: string) => ACTIVE_RENDER_STATES.includes(status ?? "");
export const sceneIndices = z.array(z.number().int().min(0).max(3000)).min(1).max(3000);
const assetPath = z.string().min(1).max(500);
export const renderRequest = z.object({
  videoId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  checkpoint: z.object({
    plan: z.object({ scenes: z.array(z.object({ narration: z.string().min(1).max(4000), sfx: z.string().max(100), camera: z.string().max(100), mood: z.enum(["tension", "reveal"]), beat: z.string().max(100) }).passthrough()).min(1).max(3000), characters: z.array(z.unknown()).max(10), hookText: z.string().max(300) }).passthrough(),
    gate: z.object({ score: z.number().min(0).max(100), ready: z.boolean(), parts: z.record(z.number()), blockers: z.array(z.string()).max(100) }),
    report: z.object({ revealSec: z.number(), shotMix: z.record(z.number()) }),
    hookType: z.string().max(100), continuity: z.number().min(0).max(1),
    images: z.array(assetPath).min(1).max(3000),
    voice: z.array(z.object({ path: assetPath, scenes: sceneIndices })).min(1).max(500),
  }),
  clips: z.array(z.object({ path: assetPath, scenes: sceneIndices })).max(500).default([]),
  captions: z.boolean(), sfx: z.boolean(),
});

export interface HostedRenderRequest {
  videoId: string;
  checkpoint: SeedanceCheckpoint;
  clips: { path: string; scenes: number[] }[];
  captions: boolean;
  sfx: boolean;
}

/** Every media grant stays inside this owner's exact video folder. */
export function validRenderAssets(userId: string, videoId: string, paths: string[]) {
  const root = `${userId}/${videoId}/`;
  return paths.every(path => path.startsWith(root) && !path.includes("..") && !path.includes("\\") && !path.includes("%"));
}

export const renderCallback = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), progress: z.number().min(0).max(100) }),
  z.object({ type: z.literal("failed"), error: z.string().min(1).max(1000) }),
  z.object({ type: z.literal("done"), duration: z.number().positive().max(1200), mime: z.enum(["video/mp4", "video/webm"]), size: z.number().int().positive().max(1_000_000_000), stats: z.object({ lufs: z.number().finite(), lra: z.number().finite(), avgShotSec: z.number().positive(), wordsPerSec: z.number().nonnegative() }) }),
]);