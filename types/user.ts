import { User as LuciaUser } from 'lucia';

export interface User extends LuciaUser {
  githubId: number;
  githubUsername: string;
  githubEmail: string;
  githubName: string;
  email: string;
  accounts?: any[];
};