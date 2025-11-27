export interface AudioConfig {
  sampleRate: number;
}

export interface VideoConfig {
  frameRate: number;
  quality: number;
}

export interface StreamStatus {
  isActive: boolean;
  isAudioConnected: boolean;
  error: string | null;
}
