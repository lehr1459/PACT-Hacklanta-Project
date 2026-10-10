import {type Page} from '@playwright/test';
import {decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionResult, keccak256, toBytes, toHex, type Abi} from 'viem';
import generatedAbi from '../../contracts/abi/PactLicensing.json';

export const abi = generatedAbi as Abi;
export const CONTRACT = '0x4444444444444444444444444444444444444444';
export const SELLER = '0x1111111111111111111111111111111111111111';
export const BUYER = '0x2222222222222222222222222222222222222222';
export const OTHER = '0x3333333333333333333333333333333333333333';
export const HASH = `0x${'a'.repeat(64)}`;
export const BLOCK_HASH = `0x${'b'.repeat(64)}`;
export const metadata = JSON.stringify({schema:'pact-license-v1', title:'QA local fixture', terms:'Test-only entitlement. No copyright transfer.', priceWei:'1000000000000000', durationSeconds:'3600'});

export type RpcFixture = {
  mode: 'ok' | 'error' | 'hang'; chain: number; code: string;
  block: bigint; blockTime: bigint; expiry: bigint; valid: boolean;
  frozen: boolean; receipt: 'success' | 'reverted' | 'pending';
  calls: {method: string; params: unknown[]}[]; terms: string;
  simulationError: boolean; onSimulation?: () => Promise<void>;
  receiptLogs: unknown[];
};

export async function installFixtures(page: Page, options: {chain?: number; connected?: boolean; wallet?: 'ok'|'reject'} = {}) {
  const state: RpcFixture = {mode:'ok', chain:84532, code:'0x6000', block:100n,
    blockTime:BigInt(Math.floor(Date.now()/1000)), expiry:BigInt(Math.floor(Date.now()/1000)+3600),
    valid:true, frozen:false, receipt:'success', calls:[], terms:metadata,simulationError:false,receiptLogs:[]};
  await page.addInitScript(({buyer, other, chain, connected, wallet, hash}) => {
    const listeners: Record<string, ((arg: unknown) => void)[]> = {};
    let accounts = connected ? [buyer] : [];
    let currentChain = chain;
    let walletMode = wallet;
    const requests: {method: string; params: unknown}[] = [];
    const provider = {
      isMetaMask:true,
      on: (event: string, callback: (arg: unknown) => void) => { (listeners[event] ??= []).push(callback); },
      removeListener: (event: string, callback: (arg: unknown) => void) => {listeners[event] = (listeners[event] ?? []).filter(f => f !== callback);},
      request: async ({method, params}: {method: string; params?: unknown[]}) => {
        requests.push({method, params});
        if (method === 'eth_requestAccounts') {accounts=[buyer]; return accounts;}
        if (method === 'eth_accounts') return accounts;
        if (method === 'eth_chainId') return `0x${currentChain.toString(16)}`;
        if (method === 'wallet_requestPermissions') return [{parentCapability:'eth_accounts'}];
        if (method === 'wallet_getPermissions') return accounts.length ? [{parentCapability:'eth_accounts'}] : [];
        if (method === 'wallet_switchEthereumChain') {currentChain=Number((params?.[0] as {chainId:string}).chainId); listeners.chainChanged?.forEach(f => f(`0x${currentChain.toString(16)}`)); return null;}
        if (method === 'eth_sendTransaction') {
          if (walletMode === 'reject') throw Object.assign(new Error('QA wallet rejected request'), {code:4001});
          return hash;
        }
        throw new Error(`Unexpected mock wallet method: ${method}`);
      },
    };
    Object.defineProperty(window, 'ethereum', {value:provider, configurable:true});
    Object.assign(window, {__pactQA: {
      requests, setWalletMode: (value: 'ok'|'reject') => {walletMode=value;},
      switchAccount: () => {accounts=[other]; listeners.accountsChanged?.forEach(f => f(accounts));},
      switchTo: (account: string) => {accounts=[account]; listeners.accountsChanged?.forEach(f => f(accounts));},
      disconnect: () => {accounts=[]; listeners.accountsChanged?.forEach(f => f(accounts));},
    }});
  }, {buyer:BUYER, other:OTHER, chain:options.chain ?? 84532, connected:options.connected ?? false, wallet:options.wallet ?? 'ok', hash:HASH});

  // Any production RPC use is forbidden by the fixture: only this localhost route resolves.
  await page.route('**/sepolia.base.org/**', route => route.abort());
  await page.route('http://127.0.0.1:8547/**', async route => {
    const request = route.request().postDataJSON();
    const requests = Array.isArray(request) ? request : [request];
    if (state.mode === 'hang') return; // Deliberately unresolved until app abort/timeout.
    for(const rpc of requests){
      if(rpc.method==='eth_call'){
        const fn=decodeFunctionData({abi,data:rpc.params[0].data}).functionName;
        if(['buyLicense','withdrawProceeds','deactivateOffer','createOffer'].includes(fn) && state.onSimulation) await state.onSimulation();
      }
    }
    const answers = requests.map((rpc: {id: number; method: string; params?: unknown[]}) => {
      const params = rpc.params ?? [];
      state.calls.push({method:rpc.method, params});
      if (state.mode === 'error') return {jsonrpc:'2.0', id:rpc.id, error:{code:-32000, message:'QA controlled RPC failure'}};
      let result: unknown;
      switch (rpc.method) {
        case 'eth_chainId': result=toHex(state.chain); break;
        case 'eth_getCode': result=state.code; break;
        case 'eth_blockNumber': result=toHex(state.block); break;
        case 'eth_getBlockByNumber': {
          if (!state.frozen && params[0] === 'latest') {state.block++; state.blockTime=BigInt(Math.floor(Date.now()/1000));}
          result={number:toHex(state.block), hash:BLOCK_HASH, parentHash:BLOCK_HASH, nonce:'0x0000000000000000', sha3Uncles:HASH, logsBloom:`0x${'0'.repeat(512)}`, transactionsRoot:HASH, stateRoot:HASH, receiptsRoot:HASH, miner:SELLER, difficulty:'0x0', totalDifficulty:'0x0', extraData:'0x', size:'0x1', gasLimit:'0x1c9c380', gasUsed:'0x0', timestamp:toHex(state.blockTime), transactions:[], uncles:[], baseFeePerGas:'0x1'};
          break;
        }
        case 'eth_call': {
          const data = (params[0] as {data: `0x${string}`}).data;
          const decoded = decodeFunctionData({abi, data});
          if(state.simulationError && ['buyLicense','withdrawProceeds','deactivateOffer','createOffer'].includes(decoded.functionName)) return {jsonrpc:'2.0',id:rpc.id,error:{code:3,message:'execution reverted: QA simulation rejection'}};
          const values: Record<string, unknown> = {
            nextOfferId:2n, offers:[SELLER,1000000000000000n,3600n,keccak256(toBytes(state.terms)),true],
            pendingWithdrawals:1000000000000000n, isLicenseValid:state.valid, licenseExpiry:state.expiry,
          };
          if (decoded.functionName === 'buyLicense' || decoded.functionName === 'withdrawProceeds' || decoded.functionName === 'deactivateOffer') result='0x';
          else if (decoded.functionName === 'createOffer') {
            const [price,duration,termsHash]=decoded.args as [bigint,bigint,`0x${string}`];
            state.receiptLogs=[{address:CONTRACT,blockHash:BLOCK_HASH,blockNumber:toHex(state.block),transactionHash:HASH,transactionIndex:'0x0',logIndex:'0x0',removed:false,topics:encodeEventTopics({abi,eventName:'OfferCreated',args:{offerId:1n,seller:BUYER}}),data:encodeAbiParameters([{type:'uint256'},{type:'uint64'},{type:'bytes32'}],[price,duration,termsHash])}];
            result=encodeFunctionResult({abi,functionName:'createOffer',result:1n});
          }
          else result=encodeFunctionResult({abi,functionName:decoded.functionName,result:values[decoded.functionName]});
          break;
        }
        case 'eth_getTransactionReceipt': result=state.receipt==='pending' ? null : {transactionHash:HASH, transactionIndex:'0x0', blockHash:BLOCK_HASH, blockNumber:toHex(state.block), from:BUYER,to:CONTRACT,cumulativeGasUsed:'0x5208',gasUsed:'0x5208',contractAddress:null,logs:state.receiptLogs,logsBloom:`0x${'0'.repeat(512)}`,status:state.receipt==='success'?'0x1':'0x0',type:'0x2',effectiveGasPrice:'0x1'}; break;
        case 'eth_getTransactionByHash': result={hash:HASH,nonce:'0x0',blockHash:BLOCK_HASH,blockNumber:toHex(state.block),transactionIndex:'0x0',from:BUYER,to:CONTRACT,value:'0x0',gasPrice:'0x1',gas:'0x5208',input:'0x',v:'0x1',r:HASH,s:HASH,type:'0x0'}; break;
        default: throw new Error(`Unexpected mock RPC method: ${rpc.method}`);
      }
      return {jsonrpc:'2.0',id:rpc.id,result};
    });
    await route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(Array.isArray(request)?answers:answers[0]), headers:{'access-control-allow-origin':'*'}});
  });
  return state;
}

export async function connect(page: Page) {
  await page.getByRole('button',{name:/Connect wallet/}).click();
  await page.getByRole('button',{name:/Disconnect/}).waitFor();
}
