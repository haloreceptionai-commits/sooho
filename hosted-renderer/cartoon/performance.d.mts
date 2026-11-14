export const CONTACT_ACTIONS: string[];
export const RIG_PARTS: string[];
export function solveArm(shoulder: number[], target: number[], upper?: number, lower?: number, bend?: number): {shoulder:number[];elbow:number[];wrist:number[]};
export function performanceAt(action:string,frame:number,start:number,end:number,contactFrame?:number): {right:{shoulder:number[];elbow:number[];wrist:number[]};left:{shoulder:number[];elbow:number[];wrist:number[]};object:number[];roll:number;stride:number;contact:number;released:boolean;state:string};
export function wristWorld(actor:number[],wrist:number[],flip?:boolean):number[];
export function drawRig(g:CanvasRenderingContext2D,atlas:CanvasImageSource,pose:ReturnType<typeof performanceAt>,mouth?:number):void;