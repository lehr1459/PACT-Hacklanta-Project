import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../src/database.mjs';
import {prepareStartupDatabase} from '../src/startup.mjs';

test('hosted startup performs no DDL on an unprepared database; local startup can explicitly initialize it',async t=>{
  const database=await createDatabase({profile:'test'});t.after(()=>database.close());
  const queries=[],original=database.query.bind(database),transaction=database.transaction.bind(database);
  database.query=(sql,values)=>{queries.push(sql);return original(sql,values);};
  database.transaction=work=>{throw Error('hosted runtime must not start a migration transaction');};
  await assert.rejects(()=>prepareStartupDatabase(database,'hosted'));
  assert.ok(queries.length>0&&queries.every(sql=>sql.startsWith('SELECT')));
  assert.equal((await original("SELECT to_regclass('public.platform_migrations') AS table_name")).rows[0].table_name,null);
  assert.equal((await original("SELECT to_regclass('public.developer_accounts') AS table_name")).rows[0].table_name,null);
  database.transaction=transaction;await prepareStartupDatabase(database,'local');
  assert.ok((await original("SELECT to_regclass('public.developer_accounts') AS table_name")).rows[0].table_name);
  await original("DELETE FROM platform_migrations WHERE name='006_clock_authority.sql'");queries.length=0;
  await assert.rejects(()=>prepareStartupDatabase(database,'hosted'),error=>error.code==='SCHEMA_DRIFT');
  assert.ok(queries.every(sql=>sql.startsWith('SELECT')));
  assert.equal(Number((await original("SELECT COUNT(*) AS count FROM platform_migrations WHERE name='006_clock_authority.sql'")).rows[0].count),0);
});
