/** A durable step yielded after saving: this is control flow, never a provider failure or fallback reason. */
export class GenerationCheckpointSaved extends Error {}
export function preserveGenerationCheckpoint(error: unknown) {
  if (error instanceof GenerationCheckpointSaved) throw error;
}