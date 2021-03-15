export interface BaseShow {
  title: string;
  description: string;
  picture: string;
  slug: string;
  meta: any;
}
export interface Show extends BaseShow {
  identifier: string;
  created: moment.Moment;
  updated: moment.Moment;
}
export interface InflatedShow extends Show {
  users: string[];
  episodes: Episode[];
}
export interface BaseEpisode {
  title: string;
  description: string;
  audio: string;
  slug: string;
  meta: any;
  scheduling: any;
}
export interface Episode extends BaseEpisode {
  identifier: string;
  created: moment.Moment;
  updated: moment.Moment;
}
export interface EpisodeLink {
  identifier: string;
  episode: string;
  show: string;
}
export interface ShowLink {
  identifier: string;
  user: string;
  show: string;
}
