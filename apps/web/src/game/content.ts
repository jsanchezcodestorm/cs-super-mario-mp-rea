import type { CampaignDefinition, LevelDefinition } from '@smw/core';

export interface Stage extends LevelDefinition {
  atlas: string;
  mode: number;
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
  const [contentResponse, movieTicksResponse] = await Promise.all([
    fetch('/assets/content.json'),
    fetch('/assets/movies/durations.json'),
  ]);
  if (!contentResponse.ok) throw Error('Campagna non disponibile sul server.');
  if (!movieTicksResponse.ok) throw Error('Durata delle animazioni non disponibile sul server.');
  const [content, movieTicks] = await Promise.all([
    contentResponse.json() as Promise<Content>,
    movieTicksResponse.json() as Promise<Record<string, number>>,
  ]);
  content.movieTicks = movieTicks;
  return content;
}
