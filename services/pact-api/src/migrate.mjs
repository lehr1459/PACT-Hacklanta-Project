import {configuration} from './config.mjs';
import {createDatabase,migrate} from './database.mjs';
let database;
try{
  database=await createDatabase(configuration());await migrate(database);
  process.stdout.write('Hosted schema migration verified.\n');
}catch{process.stderr.write('Hosted schema migration failed.\n');process.exitCode=1;}
finally{await database?.close().catch(()=>{});}
