import { db } from '../index';
import { cacheTable } from '../schema';

db.delete(cacheTable)
  .then(() => {
    console.log('✅ Cache table cleared successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error clearing cache:', error);
    process.exit(1);
  });