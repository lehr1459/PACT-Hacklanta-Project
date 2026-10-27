import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Canvas Lab | PACT Developer Platform',description:'Independent embedded checkout and wallet-authenticated server licensing example. Solana Devnet only.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
