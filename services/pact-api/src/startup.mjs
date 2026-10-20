import {migrate,verifySchema} from './database.mjs';
import {fail} from './security.mjs';

// Hosting uses a separately authorized migration step and a runtime role.
export async function prepareStartupDatabase(database,profile){
  if(profile==='hosted')return verifySchema(database);
  if(profile==='local')return migrate(database);
  fail('HOSTED_CONFIGURATION_REQUIRED',503);
}
