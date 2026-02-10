export interface User {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  emailVerified: boolean;
  githubUsername?: string | null;
  accounts?: any[];
}
