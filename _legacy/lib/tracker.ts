type RepoVisit = {
  owner: string;
  repo: string;
  branch: string;
  timestamp: number;
};

const STORAGE_KEY = 'latestVisits';
const MAX_VISITS = 5;

const trackVisit = (owner: string, repo: string, branch: string): void => {
  try {
    const storedVisits = localStorage.getItem(STORAGE_KEY);
    const visits: RepoVisit[] = storedVisits ? JSON.parse(storedVisits) : [];
    
    const existingIndex = visits.findIndex(v => 
      v.owner.toLowerCase() === owner.toLowerCase() && 
      v.repo.toLowerCase() === repo.toLowerCase());
    
    const currentTime = Math.floor(Date.now() / 1000);
    
    if (existingIndex >= 0) {
      visits[existingIndex] = {
        owner,
        repo,
        branch,
        timestamp: currentTime
      };
    } else {
      visits.push({
        owner,
        repo,
        branch,
        timestamp: currentTime
      });
    }
    
    const updatedVisits = visits
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_VISITS);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedVisits));
  } catch (error) {
    console.error('Failed to save recent visit to localStorage', error);
  }
}

const getVisits = (): RepoVisit[] => {
  try {
    const storedVisits = localStorage.getItem(STORAGE_KEY);
    const visits: RepoVisit[] = storedVisits ? JSON.parse(storedVisits) : [];
    return visits;
  } catch (error) {
    console.error('Failed to load recent visits from localStorage', error);
    return [];
  }
}

export { trackVisit, getVisits }