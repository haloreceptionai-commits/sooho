export interface CameraKey { frame: number; pos: number[]; look: number[]; fov: number; roll?: number; path?: number[][]; shadowAt?: number[] }
export function smootherstep(x: number): number;
export function pathAt(points: number[][], progress: number): number[];
export function cameraAt(keys: CameraKey[], frame: number): CameraKey & { roll: number };
export function actorIdle(frame: number, seed: number): { bob: number; tilt: number; headTilt: number };