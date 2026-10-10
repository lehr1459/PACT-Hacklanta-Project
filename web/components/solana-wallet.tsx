'use client';
import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState,type WalletName } from '@solana/wallet-adapter-base';
import { errorText,shortKey } from '../lib/solana/rpc';
export function SolanaWallet({onError,busy}:{onError:(message:string)=>void;busy:boolean}){
  const {wallet,wallets,select,connect,disconnect,connected,connecting,disconnecting,publicKey}=useWallet();
  useEffect(()=>{if(!wallet)select('Phantom' as WalletName);},[wallet,select]);
  const available=wallet?.readyState===WalletReadyState.Installed||wallet?.readyState===WalletReadyState.Loadable;
  return <div className="solana-wallet">
    <select aria-label="Wallet provider" value={wallet?.adapter.name??'Phantom'} disabled={busy||connecting||disconnecting||connected} onChange={e=>{onError('');select(e.target.value as WalletName);}}>{wallets.filter(item=>item.adapter.name==='Phantom'||item.adapter.name==='Solflare').map(item=><option key={item.adapter.name} value={item.adapter.name}>{item.adapter.name}</option>)}</select>
    {connected&&publicKey?<button className="button subtle" title={publicKey.toBase58()} aria-label={`Disconnect wallet ${publicKey.toBase58()}`} disabled={disconnecting} onClick={()=>void disconnect().catch(error=>onError(errorText(error)))}>{shortKey(publicKey.toBase58())} · Disconnect</button>:<button className="button dark" disabled={!available||busy||connecting} onClick={()=>{onError('');void connect().catch(error=>onError(errorText(error)));}}>{connecting?'Connecting…':'Connect wallet ↗'}</button>}
    {!connected&&!available?<span className="fine" role="status">{wallet?.adapter.name??'Phantom'} extension not installed. <a href={wallet?.adapter.name==='Solflare'?'https://solflare.com/download':'https://phantom.com/download'} target="_blank" rel="noreferrer">Install manually ↗</a></span>:null}
  </div>;
}
