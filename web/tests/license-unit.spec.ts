import {test, expect} from '@playwright/test';
import {keccak256, toBytes, type Address} from 'viem';
import {acquireLicenseSnapshot, snapshotHasAccess, metadataBytesWithinLimit, parseLicenseMetadata, metadataMatchesOffer, formatExpiry, READ_TIMEOUT_MS, type LicenseSnapshot, type SnapshotSource} from '../lib/license';
import {abi, BUYER, CONTRACT, metadata} from './fixtures';

test.describe('Mocked local snapshot and metadata contracts', () => {
  test.skip(() => process.env.PACT_QA_MODE === 'setup', 'Setup build has no configured contract');
  test('snapshot pins every contract/code read to one mined block and records identity', async () => {
    const reads: {blockNumber: bigint; functionName?: string}[] = [];
    const source: SnapshotSource = {
      getChainId:async()=>84532, getBlock:async()=>({number:123n,timestamp:1000n}),
      getCode:async args=>{reads.push(args);return '0x6000';},
      readContract:async args=>{reads.push(args); return ({nextOfferId:2n,isLicenseValid:true,licenseExpiry:1100n} as Record<string,unknown>)[args.functionName];},
    };
    const snapshot = await acquireLicenseSnapshot({source,contract:CONTRACT as Address,abi,offerId:'1',holder:BUYER as Address,session:7,clock:()=>500});
    expect(reads).toHaveLength(4);
    expect(reads.every(read=>read.blockNumber===123n)).toBe(true);
    expect(snapshot).toMatchObject({offerId:'1',holder:BUYER,contract:CONTRACT,session:7,chainId:84532,blockNumber:123n,chainTimestamp:1000n});
  });
  test('wrong chain, unknown ID, no bytecode and inconsistent expiry fail closed', async () => {
    const base: SnapshotSource = {getChainId:async()=>84532,getBlock:async()=>({number:1n,timestamp:1000n}),getCode:async()=> '0x6000',readContract:async args=>({nextOfferId:1n,isLicenseValid:true,licenseExpiry:1100n} as Record<string,unknown>)[args.functionName]};
    const get = (source: SnapshotSource,id='0')=>acquireLicenseSnapshot({source,contract:CONTRACT as Address,abi,offerId:id,holder:BUYER as Address,session:0,clock:()=>0});
    await expect(get({...base,getChainId:async()=>8453})).rejects.toThrow('not Base Sepolia');
    await expect(get(base,'1')).rejects.toThrow('does not exist');
    await expect(get({...base,getCode:async()=> '0x'})).rejects.toThrow('No contract exists');
    await expect(get({...base,readContract:async args=>args.functionName==='licenseExpiry'?1000n:base.readContract(args)})).rejects.toThrow('inconsistent');
  });
  test('monotonic freshness, unchanged-block age and exact expiry close access', () => {
    const snapshot: LicenseSnapshot = {offerId:'0',holder:BUYER as Address,contract:CONTRACT as Address,chainId:84532,session:1,blockNumber:1n,chainTimestamp:1000n,expiry:1100n,valid:true,startedAtMs:100,receivedAtMs:100};
    expect(snapshotHasAccess(snapshot,8099,100)).toBe(true);
    expect(snapshotHasAccess(snapshot,8100,100)).toBe(false);
    expect(snapshotHasAccess({...snapshot,startedAtMs:12000},12100,100)).toBe(false);
    expect(snapshotHasAccess(snapshot,99,100)).toBe(false);
    expect(snapshotHasAccess({...snapshot,expiry:1001n},1099,100)).toBe(true);
    expect(snapshotHasAccess({...snapshot,expiry:1001n},1100,100)).toBe(false);
    expect(formatExpiry(18446744073709551615n)).toContain('outside calendar display range');
  });
  test('an unresolved snapshot source times out after the specified five seconds',async()=>{
    const source: SnapshotSource={getChainId:()=>new Promise(()=>{}),getBlock:async()=>({number:1n,timestamp:1000n}),getCode:async()=> '0x6000',readContract:async()=>0n};
    const started=performance.now();
    await expect(acquireLicenseSnapshot({source,contract:CONTRACT as Address,abi,offerId:'0',holder:BUYER as Address,session:0,clock:()=>performance.now()})).rejects.toThrow('timed out');
    const elapsed=performance.now()-started;
    expect(READ_TIMEOUT_MS).toBe(5000);
    expect(elapsed).toBeGreaterThanOrEqual(4900);
    expect(elapsed).toBeLessThan(6500);
  });
  test('shared 64KiB UTF-8 boundary and exact bytes/schema/parameters', () => {
    const parsed=JSON.parse(metadata);
    const prefix=JSON.stringify({...parsed,terms:''});
    const max=JSON.stringify({...parsed,terms:'x'.repeat(65536-new TextEncoder().encode(prefix).length)});
    expect(new TextEncoder().encode(max).length).toBe(65536);
    expect(parseLicenseMetadata(max)).toBeDefined();
    expect(metadataBytesWithinLimit(max+' ')).toBe(false);
    expect(parseLicenseMetadata(max+' ')).toBeUndefined();
    expect(metadataBytesWithinLimit('é'.repeat(32768))).toBe(true);
    expect(metadataBytesWithinLimit('é'.repeat(32769))).toBe(false);
    const offer={termsHash:keccak256(toBytes(metadata)),price:1000000000000000n,duration:3600n};
    expect(metadataMatchesOffer(metadata,offer)).toBe(true);
    expect(metadataMatchesOffer(metadata+' ',offer)).toBe(false);
    expect(metadataMatchesOffer(metadata,{...offer,price:1n})).toBe(false);
    expect(metadataMatchesOffer(JSON.stringify({...parsed,schema:'unknown'}),offer)).toBe(false);
    expect(parseLicenseMetadata(JSON.stringify({...parsed,durationSeconds:'18446744073709551616'}))).toBeUndefined();
  });
});
