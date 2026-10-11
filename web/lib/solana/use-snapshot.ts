'use client';
import { useEffect,useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parsePublicKey } from './protocol';
import { acquireSolanaSnapshot,FRESHNESS_MS,programId,SLOT_PROGRESS_MS,snapshotHasAccess,type SolanaSnapshot } from './rpc';
export function useSolanaSnapshot(offerAddress:string,holder:string|undefined,permitted=true){
  const identity=`${programId?.toBase58()??''}:${offerAddress}:${holder??''}:${permitted}`;
  const [session,setSession]=useState({identity,generation:0,active:false});
  if(session.identity!==identity)setSession({...session,identity,generation:session.generation+1});
  const [now,setNow]=useState(0);
  const [progress,setProgress]=useState<{scope:string;slot:bigint;at:number;snapshot:SolanaSnapshot}|null>(null);
  const scope=`${identity}:${session.generation}`;
  useEffect(()=>{const update=()=>setSession(previous=>({...previous,active:navigator.onLine&&document.visibilityState==='visible',generation:previous.generation+1}));update();window.addEventListener('online',update);window.addEventListener('offline',update);document.addEventListener('visibilitychange',update);const timer=setInterval(()=>setNow(performance.now()),200);setNow(performance.now());return()=>{clearInterval(timer);window.removeEventListener('online',update);window.removeEventListener('offline',update);document.removeEventListener('visibilitychange',update);};},[]);
  const enabled=Boolean(permitted&&session.active&&programId&&parsePublicKey(offerAddress)&&holder&&parsePublicKey(holder));
  const query=useQuery({queryKey:['solana-license-snapshot',scope],enabled,retry:false,staleTime:0,gcTime:0,refetchInterval:4000,refetchIntervalInBackground:false,refetchOnWindowFocus:'always',networkMode:'always',queryFn:()=>acquireSolanaSnapshot({program:programId!,offerAddress,holder:holder!,session:session.generation,clock:()=>performance.now()})});
  // Accept new read bookkeeping before children commit, without a transient stale frame.
  if(query.isSuccess&&query.data&&(!progress||progress.scope!==scope||(progress.snapshot!==query.data&&query.data.slot>=progress.slot))){
    const snapshot=query.data;
    setProgress(!progress||progress.scope!==scope||snapshot.slot>progress.slot?{scope,slot:snapshot.slot,at:snapshot.startedAtMs,snapshot}:{...progress,snapshot});
    setNow(performance.now());
  }
  const fresh=Boolean(enabled&&query.isSuccess&&!query.isError&&!query.isPaused&&query.data&&query.data.session===session.generation&&progress?.scope===scope&&progress.snapshot===query.data&&now>=query.data.startedAtMs&&now-query.data.startedAtMs<FRESHNESS_MS&&now-progress.at<SLOT_PROGRESS_MS);
  const valid=Boolean(fresh&&query.data&&progress&&snapshotHasAccess(query.data,now,progress.at));
  return{...query,fresh,valid,active:session.active,snapshot:fresh?query.data:undefined};
}
