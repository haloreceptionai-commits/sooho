export type VideoEngine = 'own' | 'cartoon' | 'advanced' | 'advanced-v2';
/** Advanced Video AI: the story-matched painted characters in 3D sets (default) or the Everything World zone sets (v2). */
export const isAdvancedEngine = (engine: unknown) => engine === 'advanced' || engine === 'advanced-v2';
/** Advanced engines render on the cartoon worker with painted character cards and no preview gate. */
export const usesCartoonWorker = (engine: unknown) => engine === 'cartoon' || isAdvancedEngine(engine);
/** The render manifest's `renderer` flag: 'cartoon-v2' asks the Blender worker for Everything World zone sets. */
export const rendererFor = (engine: unknown) => (engine === 'advanced-v2' ? 'cartoon-v2' : undefined);
/** Legacy library records remain readable, but cannot launch removed paid engines. */
export function assertVideoEngine(engine: unknown): asserts engine is VideoEngine | undefined {
  if (engine !== undefined && engine !== 'own' && engine !== 'cartoon' && engine !== 'advanced' && engine !== 'advanced-v2') {
    throw new Error('This video model has been removed. Create a new video using Own model, Own cartoon, Advanced Video AI or Advanced Cartoon v2.');
  }
}
