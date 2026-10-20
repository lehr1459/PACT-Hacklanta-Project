import './style.css';
export const metadata = {title: 'Independent PACT Next.js consumer', description: 'A React frontend with a server-enforced PACT backend.'};
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
