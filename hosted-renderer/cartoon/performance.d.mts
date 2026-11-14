export const CONTACT_ACTIONS: string[];
export const RIG_PARTS: string[];
type Point = [number,number];
type Arm = {shoulder:Point;elbow:Point;wrist:Point};
export function solveArm(shoulder: number[], target: number[], upper?: number, lower?: number, bend?: number): Arm;
export function performanceAt(action:string,frame:number,start:number,end:number,contactFrame?:number): {right:Arm;left:Arm;object:Point;roll:number;stride:number;contact:number;released:boolean;state:string};
export function wristWorld(actor:number[],wrist:number[],flip?:boolean):[number,number,number];
export function prepareRig(atlas:CanvasImageSource,makeCanvas?:()=>HTMLCanvasElement):HTMLCanvasElement[];
export function drawRig(g:CanvasRenderingContext2D,atlas:CanvasImageSource[],pose:ReturnType<typeof performanceAt>,mouth?:number):void;