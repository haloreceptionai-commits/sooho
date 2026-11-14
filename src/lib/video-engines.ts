export type VideoEngine = 'own' | 'cartoon' | 'advanced';
/** Advanced Video AI renders on the cartoon worker with painted character cards and no preview gate. */
export const usesCartoonWorker = (engine: unknown) => engine === 'cartoon' || engine === 'advanced';
/** Legacy library records remain readable, but cannot launch removed paid engines. */
export function assertVideoEngine(engine: unknown): asserts engine is VideoEngine | undefined {
  if (engine !== undefined && engine !== 'own' && engine !== 'cartoon' && engine !== 'advanced') {
    throw new Error('This video model has been removed. Create a new video using Own model, Own cartoon or Advanced Video AI.');
  }
}