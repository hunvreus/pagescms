import { db } from '../index';
import { cacheFileTable, cachePermissionTable } from '../schema';

db.delete(cacheFileTable)
  .then(() => {
    console.log('✅ File cache cleared successfully');
    return db.delete(cachePermissionTable);
  })
  .then(() => {
    console.log('✅ Permission cache cleared successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error clearing cache:', error);
    process.exit(1);
  });