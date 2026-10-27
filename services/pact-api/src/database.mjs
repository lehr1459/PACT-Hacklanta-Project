import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ApiError} from './security.mjs';

export async function createDatabase({connectionString, localPath, profile = 'local', maxPending = 24} = {}) {
  if (!Number.isSafeInteger(maxPending) || maxPending < 2 || maxPending > 64) throw new ApiError('DATABASE_CONFIGURATION_REQUIRED',503);
  if (profile === 'hosted' && connectionString) {
    try {
      const url = new URL(connectionString);
      const keys=[...url.searchParams.keys()];
      if (!['postgres:','postgresql:'].includes(url.protocol) || url.searchParams.get('sslmode')!=='verify-full'
        || new Set(keys).size!==keys.length || keys.some(key=>!['sslmode','sslrootcert','sslcert','sslkey'].includes(key))) throw Error();
    } catch { throw new ApiError('DATABASE_TLS_REQUIRED',503); }
  }
  let engine, protectedEngine, kind;
  if (connectionString) {
    const {Pool} = await import('pg');
    const poolOptions={connectionString, max: 2, connectionTimeoutMillis: 1500,
      idleTimeoutMillis: 30000, statement_timeout: 2500, query_timeout: 3000,
      application_name: 'pact-hosted-api',options:'-c synchronous_commit=on'};
    engine = new Pool(poolOptions);protectedEngine=new Pool(poolOptions);
    engine.on('error', () => {}); // Never log provider messages/URLs/secrets.
    protectedEngine.on('error',()=>{});
    kind = 'postgres';
  } else {
    if (!['local','test'].includes(profile)) throw new ApiError('DATABASE_CONFIGURATION_REQUIRED', 503);
    const {PGlite} = await import('@electric-sql/pglite');
    engine = new PGlite(localPath ?? 'memory://');
    await engine.waitReady;
    protectedEngine=engine;
    kind = 'pglite';
  }
  let pending = 0, protectedPending=0, closed = false;
  const laneLimit=Math.max(1,Math.floor(maxPending/2));
  async function admitted(work, protectedLane=false) {
    if (closed || (protectedLane?protectedPending:pending) >= laneLimit) throw new ApiError('DATABASE_UNAVAILABLE', 503);
    if(protectedLane)protectedPending++;else pending++;
    try { return await work(); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      if (error?.code === '23505') throw new ApiError('CONFLICT', 409);
      throw new ApiError('DATABASE_UNAVAILABLE', 503);
    } finally {if(protectedLane)protectedPending--;else pending--;}
  }
  function lane(protectedLane){
    const selected=protectedLane?protectedEngine:engine;
    return{
    query: (sql, values = []) => admitted(() => selected.query(sql, values),protectedLane),
    transaction: work => admitted(async () => {
      if (kind === 'pglite') return selected.transaction(tx => work({query: (sql, values = []) => tx.query(sql, values)}));
      const client = await selected.connect();
      let destroy=false;
      try {
        await client.query('BEGIN');
        const result = await work({query: (sql, values = []) => client.query(sql, values)});
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try{await client.query('ROLLBACK');}catch{destroy=true;}
        throw error;
      } finally { client.release(destroy); }
    },protectedLane),
    };
  }
  const database = {
    kind,...lane(false),protected:lane(true),
    async close() { closed = true; await (kind === 'pglite' ? engine.close() : Promise.all([engine.end(),protectedEngine.end()])); },
    diagnostics: () => ({kind, pending, protectedPending, maxPending:laneLimit*2,perLaneLimit:laneLimit,closed}),
  };
  return database;
}

export async function verifySchema(database){
  const directory=fileURLToPath(new URL('../migrations/',import.meta.url));
  const files=(await readdir(directory)).filter(f=>/^\d{3}_[a-z_]+\.sql$/.test(f)).sort();
  const expected=await Promise.all(files.map(async name=>({name,checksum:createHash('sha256').update(await readFile(`${directory}/${name}`,'utf8')).digest('hex')})));
  const actual=(await database.query('SELECT name,checksum FROM platform_migrations ORDER BY name')).rows;
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new ApiError('SCHEMA_DRIFT',503);
}

export async function migrate(database) {
  const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
  const files = (await readdir(directory)).filter(f => /^\d{3}_[a-z_]+\.sql$/.test(f)).sort();
  await database.transaction(async tx => {
    if (database.kind === 'postgres') await tx.query('SELECT pg_advisory_xact_lock(726742813)');
    await tx.query('CREATE TABLE IF NOT EXISTS platform_migrations (name text PRIMARY KEY, checksum text NOT NULL)');
    const applied = (await tx.query('SELECT name,checksum FROM platform_migrations ORDER BY name')).rows;
    if (applied.some(row => !files.includes(row.name))) throw new ApiError('SCHEMA_DRIFT', 503);
    for (const file of files) {
      const sql = await readFile(`${directory}/${file}`, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prior = applied.find(row => row.name === file);
      if (prior && prior.checksum !== checksum) throw new ApiError('SCHEMA_DRIFT', 503);
      if (!prior) {
        // No untrusted interpolation: SQL is a checked-in migration file.
        for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await tx.query(statement);
        await tx.query('INSERT INTO platform_migrations(name,checksum) VALUES($1,$2)', [file, checksum]);
      }
    }
  });
}
