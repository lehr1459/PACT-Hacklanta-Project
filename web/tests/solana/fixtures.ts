import {PublicKey} from '@solana/web3.js';
import {Buffer} from 'buffer';
import {deriveOffer,deriveLicense,metadataHash,SYSVAR_OWNER} from '../../lib/solana/protocol';
export const program=new PublicKey(new Uint8Array(32).fill(7)),seller=new PublicKey(new Uint8Array(32).fill(1)),buyer=new PublicKey(new Uint8Array(32).fill(2));
export const metadata=JSON.stringify({schema:'pact-solana-license-v1',title:'Local synthetic demo',terms:'Personal demonstration access.',priceLamports:'1000000',durationSeconds:'60'});
export const [offer,bump]=deriveOffer(program,seller,1n),[license,licenseBump]=deriveLicense(program,offer,buyer);
export function offerBytes(){const b=Buffer.alloc(98);Buffer.from('d7583c47aaa249e5','hex').copy(b);seller.toBuffer().copy(b,8);b.writeBigUInt64LE(1n,40);b.writeBigUInt64LE(1000000n,48);b.writeBigUInt64LE(60n,56);Buffer.from(metadataHash(metadata).slice(2),'hex').copy(b,64);b[96]=1;b[97]=bump;return b;}
export function licenseBytes(expiry=1060n){const b=Buffer.alloc(81);Buffer.from('f898c364b96cb0e7','hex').copy(b);offer.toBuffer().copy(b,8);buyer.toBuffer().copy(b,40);b.writeBigInt64LE(expiry,72);b[80]=licenseBump;return b;}
export function account(data:Buffer,owner=program.toBase58()){return {data:[data.toString('base64'),'base64'],owner,executable:false,lamports:1000000};}
export function accounts(){const clock=Buffer.alloc(40);clock.writeBigUInt64LE(100n);clock.writeBigInt64LE(1000n,32);return [account(offerBytes()),account(licenseBytes()),account(clock,SYSVAR_OWNER),{...account(Buffer.alloc(0),'BPFLoaderUpgradeab1e11111111111111111111111'),executable:true}];}
