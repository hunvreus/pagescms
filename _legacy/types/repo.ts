export interface Repo {
  id: number;
  owner: string;
  ownerId: number;
  repo: string;
  branches?: string[];
  defaultBranch?: string;
  isPrivate: boolean;
};