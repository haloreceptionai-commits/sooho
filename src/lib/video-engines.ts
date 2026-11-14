export type VideoEngine = 'own' | 'cartoon';
/** Legacy library records remain readable, but cannot launch removed paid engines. */
export function assertVideoEngine(engine: unknown): asserts engine is VideoEngine | undefined {
  if (engine !== undefined && engine !== 'own' && engine !== 'cartoon') {
    throw new Error('This video model has been removed. Create a new video using Own model or Own cartoon.');
  }
}