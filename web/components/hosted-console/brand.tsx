/** Plain image avoids inline styles on the strict-CSP hosted authentication surface. */
export function HostedBrand() {
  return <a className="brand brand-banner" href="/" aria-label="PACT home">
    <img src="/brand/pact-logo.png" alt="PACT" width={2172} height={724} className="brand-artwork" />
    <span className="brand-sub">License protocol</span>
  </a>;
}
