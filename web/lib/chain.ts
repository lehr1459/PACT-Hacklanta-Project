import { createPublicClient, http, isAddress, type Abi, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import generatedAbi from '../../contracts/abi/PactLicensing.json';
export const pactAbi = generatedAbi as Abi;
const configuredAddress = process.env.NEXT_PUBLIC_PACT_CONTRACT_ADDRESS;
export const pactAddress: Address | undefined = configuredAddress && isAddress(configuredAddress) && !/^0x0{40}$/i.test(configuredAddress) ? configuredAddress : undefined;
export const publicClient = createPublicClient({chain: baseSepolia, transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org', {timeout: 5000, retryCount: 0})});
export type Offer = {id: bigint; seller: Address; price: bigint; duration: bigint; termsHash: `0x${string}`; active: boolean};
export async function assertContract() {
  if (!pactAddress) throw new Error('Configure a deployed PACT address before using the chain.');
  if (await publicClient.getChainId() !== baseSepolia.id) throw new Error('The configured RPC is not Base Sepolia (84532). Chain actions are disabled.');
  const code = await publicClient.getCode({address: pactAddress});
  if (!code || code === '0x') throw new Error('No contract exists at the configured Base Sepolia address.');
  return pactAddress;
}
export async function readOffer(id: bigint): Promise<Offer> {
  const address = await assertContract();
  const count = await publicClient.readContract({address, abi: pactAbi, functionName: 'nextOfferId'}) as bigint;
  if (id >= count) throw new Error('This offer does not exist.');
  const [seller, price, duration, termsHash, active] = await publicClient.readContract({address, abi: pactAbi, functionName: 'offers', args: [id]}) as [Address, bigint, bigint, `0x${string}`, boolean];
  return {id, seller, price, duration, termsHash, active};
}
export function shortAddress(address: string) {return `${address.slice(0, 6)}…${address.slice(-4)}`;}
export function errorText(error: unknown) {return error instanceof Error ? error.message.split('\n')[0] : 'The request failed. Please try again.';}
