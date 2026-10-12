'use client';

import {createElement, useEffect, useRef, useState, type CSSProperties} from 'react';
import {mountCheckout, type CheckoutController, type MountCheckoutOptions, type WidgetState} from './widget.js';
import type {WalletAdapter} from './checkout.js';

export type PactCheckoutProps = Omit<MountCheckoutOptions,'element'|'walletAdapter'> & {
  /** A fresh adapter for each mount. The checkout owns and destroys this adapter. */
  walletAdapterFactory?:()=>WalletAdapter;
  className?:string;
  style?:CSSProperties;
  onReady?:(controller:CheckoutController)=>void;
};

/** SSR-safe React checkout backed by the existing SDK state machine. Never connects on mount. */
export function PactCheckout(props:PactCheckoutProps) {
  const host=useRef<HTMLDivElement>(null);
  const callbacks=useRef(props);
  callbacks.current=props;
  const [failure,setFailure]=useState('');
  const {offer,programId,rpcUrl,metadataJson,walletAdapterFactory,now}=props;
  useEffect(()=>{
    if(!host.current)return;
    let controller:CheckoutController|undefined;
    let adapter:WalletAdapter|undefined;
    setFailure('');
    try {
      adapter=walletAdapterFactory?.();
      controller=mountCheckout({element:host.current,offer,programId,rpcUrl,metadataJson,now,
        walletAdapter:adapter,
        onState:(state:Readonly<WidgetState>)=>callbacks.current.onState?.(state),
        onLicenseActive:license=>callbacks.current.onLicenseActive?.(license),
      });
      callbacks.current.onReady?.(controller);
    } catch {
      if(controller)controller.destroy();else adapter?.destroy();
      setFailure('Checkout could not initialize. Check the public offer, Devnet program and RPC configuration.');
    }
    return ()=>controller?.destroy();
  },[offer,programId,rpcUrl,metadataJson,walletAdapterFactory,now]);
  return createElement('div',{className:props.className,style:props.style},
    createElement('div',{ref:host,'aria-label':'PACT embedded checkout'}),
    failure?createElement('p',{role:'alert'},failure):null,
  );
}
