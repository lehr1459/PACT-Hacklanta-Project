'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAddress, type Address } from 'viem';
import { pactAbi, pactAddress, publicClient } from './chain';
import { acquireLicenseSnapshot, CHAIN_PROGRESS_MS, FRESHNESS_MS, snapshotHasAccess, validOfferId, type LicenseSnapshot, type SnapshotSource } from './license';

export function useLicenseSnapshot(offerId: string, holder: string | undefined, permitted = true) {
  const identity = `${pactAddress ?? ''}:${offerId}:${holder?.toLowerCase() ?? ''}:${permitted}`;
  const [session, setSession] = useState({identity, generation: 0, active: false});
  // Reset before committing a render with another identity, including A → B → A.
  if (session.identity !== identity) setSession({...session, identity, generation: session.generation + 1});
  const [now, setNow] = useState(0);
  const [progress, setProgress] = useState<{scope: string; block: bigint; at: number; snapshot: LicenseSnapshot} | null>(null);
  const scope = `${identity}:${session.generation}`;
  useEffect(() => {
    const update = () => setSession(previous => ({...previous, active: navigator.onLine && document.visibilityState === 'visible', generation: previous.generation + 1}));
    update();
    window.addEventListener('online', update); window.addEventListener('offline', update); document.addEventListener('visibilitychange', update);
    const timer = setInterval(() => setNow(performance.now()), 200);
    setNow(performance.now());
    return () => {clearInterval(timer); window.removeEventListener('online', update); window.removeEventListener('offline', update); document.removeEventListener('visibilitychange', update);};
  }, []);
  const enabled = Boolean(permitted && session.active && pactAddress && holder && isAddress(holder) && validOfferId(offerId));
  const query = useQuery({
    queryKey: ['license-snapshot', scope], enabled, retry: false, staleTime: 0, gcTime: 0,
    refetchInterval: 4000, refetchIntervalInBackground: false, refetchOnWindowFocus: 'always', networkMode: 'always',
    queryFn: () => acquireLicenseSnapshot({source: publicClient as unknown as SnapshotSource, contract: pactAddress!, abi: pactAbi, offerId, holder: holder as Address, session: session.generation, clock: () => performance.now()}),
  });
  useEffect(() => {
    const snapshot = query.data;
    if (!snapshot || !query.isSuccess) return;
    setProgress(previous => {
      if (!previous || previous.scope !== scope || snapshot.blockNumber > previous.block) return {scope, block: snapshot.blockNumber, at: snapshot.startedAtMs, snapshot};
      if (snapshot.blockNumber < previous.block) return previous;
      return {...previous, snapshot};
    });
  }, [query.data, query.isSuccess, scope]);
  const fresh = Boolean(enabled && query.isSuccess && !query.isError && !query.isPaused && query.data && query.data.session === session.generation && progress?.scope === scope && progress.snapshot === query.data && now >= query.data.startedAtMs && now - query.data.startedAtMs < FRESHNESS_MS && now - progress.at < CHAIN_PROGRESS_MS);
  const valid = Boolean(fresh && query.data && progress && snapshotHasAccess(query.data, now, progress.at));
  return {...query, fresh, valid, active: session.active, snapshot: fresh ? query.data : undefined};
}
