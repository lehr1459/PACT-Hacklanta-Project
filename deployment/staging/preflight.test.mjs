import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseConfiguration,validateCompose,dockerEnvironment} from './bin/preflight.mjs';
const compose=JSON.parse(await fs.readFile(new URL('./compose.json',import.meta.url)));
const values={PACT_STAGING_DOMAIN:'pact-staging.fixture.invalid',PACT_PUBLIC_RPC_ORIGIN:'https://api.devnet.solana.com',PACT_API_IMAGE:'sha256:'+'a'.repeat(64),PACT_WEB_IMAGE:'sha256:'+'b'.repeat(64),PACT_CONFIG_DIRECTORY:'/source/deployment/staging',PACT_PRIVATE_DIRECTORY:'/private/pact',PACT_PG_DATA:'/data/postgres',PACT_CLOCK_DIRECTORY:'/data/clock',PACT_SOURCE_REVISION:'c'.repeat(40)};
const encoded=value=>Object.entries(value).map(([k,v])=>k+'='+v).join('\n');
test('kit is host-networked, manually started, immutable and has separate offline migration authority',()=>assert.equal(validateCompose(compose),true));
test('public ports, implicit image builds, extra capabilities and restarts violate staging boundary',()=>{
 for(const mutation of [c=>c.services.api.ports=['4100:4100'],c=>c.services.web.build='.',c=>c.services.api.restart='always',c=>c.services.api.cap_add=['SYS_ADMIN'],c=>c.services.api.network_mode='bridge',c=>c.services.migrate.volumes[2].source='/runtime-role.json']){
  const changed=structuredClone(compose);mutation(changed);assert.throws(()=>validateCompose(changed));
 }
});
test('operator input rejects blank templates, placeholders and nonimmutable images',()=>{
 assert.throws(()=>parseConfiguration('PACT_STAGING_DOMAIN='));
 const good={...values,PACT_STAGING_DOMAIN:'staging.owner-controlled.org'};assert.equal(parseConfiguration(encoded(good)).PACT_SOURCE_REVISION,good.PACT_SOURCE_REVISION);
 for(const changed of [{...good,PACT_API_IMAGE:'pact:latest'},{...good,PACT_SOURCE_REVISION:'main'},{...good,PACT_PRIVATE_DIRECTORY:'/data'},{...good,PACT_STAGING_DOMAIN:'OWNER_APPROVED_DOMAIN'}])assert.throws(()=>parseConfiguration(encoded(changed)));
});
test('shell interpolation, duplicate/secret/unknown variables, nonHTTPS and placeholder domains fail closed',()=>{
 for(const text of [encoded(values),encoded(values)+'\nPACT_HOSTED_PEPPER=x',encoded(values)+'\nPACT_STAGING_DOMAIN=x',encoded({...values,PACT_STAGING_DOMAIN:'$(command)'}),encoded({...values,PACT_PUBLIC_RPC_ORIGIN:'http://example.org'})])assert.throws(()=>parseConfiguration(text));
});
test('ambient Compose/image/remote-Docker overrides cannot replace parsed host configuration',()=>{
 const env=dockerEnvironment(values,{PATH:'/bin',HOME:'/home/operator',PACT_API_IMAGE:'unreviewed:latest',DOCKER_HOST:'tcp://remote:2375',DOCKER_CONTEXT:'remote',COMPOSE_FILE:'other.json',COMPOSE_PROFILES:'ingress',AWS_SECRET_ACCESS_KEY:'fixture-private'});
 assert.equal(env.PACT_API_IMAGE,values.PACT_API_IMAGE);assert.equal(env.PACT_PRIVATE_DIRECTORY,values.PACT_PRIVATE_DIRECTORY);
 for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','COMPOSE_FILE','COMPOSE_PROFILES','AWS_SECRET_ACCESS_KEY'])assert.equal(env[name],undefined);
});
