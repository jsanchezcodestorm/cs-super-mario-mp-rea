import type { CampaignDefinition, LevelDefinition } from '@smw/core';

export interface Stage extends LevelDefinition {
  atlas: string;
  spriteTileset: number;
  animatedTiles?: Record<number, number[]>;
  backgroundColor: string;
  background?: {
    width: number;
    height: number;
    tiles: number[];
    repeat: boolean;
    scroll?: { x: number; y: number; offsetY: number };
  };
  music: number;
}
export interface Content extends CampaignDefinition {
  levels: Record<string, Stage>;
  places?: Record<string, { map: number; x: number; y: number }>;
}

export async function loadContent(): Promise<Content> {
  const response = await fetch('/assets/content.json');
  if (!response.ok) throw Error('Campagna non disponibile sul server.');
  return response.json();
}
