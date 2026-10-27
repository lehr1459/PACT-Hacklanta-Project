import Image from 'next/image';

export function PactBrand({compact = false}: {compact?: boolean}) {
  const artwork = <Image src="/brand/pact-logo.png" alt={compact ? '' : 'PACT'} width={2172} height={724} sizes={compact ? '218px' : '(max-width: 720px) 210px, 276px'} className="brand-artwork" />;
  if (compact) return <span className="brand brand-compact"><span className="brand-symbol" aria-hidden="true">{artwork}</span>PACT</span>;
  return <a className="brand brand-banner" href="/" aria-label="PACT home">{artwork}<span className="brand-sub">License protocol</span></a>;
}
