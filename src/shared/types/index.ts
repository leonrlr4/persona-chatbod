export type Persona = {
  id: string;
  name: string;
  story: string;
  traits: string[];
  beliefs: string[];
  embedding?: number[];
};

export type UserPrefs = {
  userId: string;
  language: "zh" | "en";
  vadThreshold: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  personaId?: string;
};

export type RAGQuery = {
  text?: string;
  embedding?: number[];
  k?: number;
  index?: string;
};