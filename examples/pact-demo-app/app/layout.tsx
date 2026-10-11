import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Prism Studio | PACT integration demo',description:'An independent premium palette workspace, licensed through PACT on Solana Devnet.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
