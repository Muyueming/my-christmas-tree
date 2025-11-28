
export enum TreeMode {
  CHAOS = 'CHAOS',
  FORMED = 'FORMED'
}

export interface TreeState {
  mode: TreeMode;
  rotationSpeed: number;
  lightIntensity: number;
  showGoldDust: boolean;
}

export interface PhotoData {
  id: number;
  url?: string; // Optional URL for real images later
  color: string;
}
