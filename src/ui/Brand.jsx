export function BrandMark({ stroke = '#F8F6F0', label }) {
  return (
    <svg className="brand-mark" viewBox="0 0 48 48" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect x="18" y="5" width="9" height="38" rx="4.5" fill="currentColor" />
      <path d="M12 17c7 0 10-4 11-10-7 0-11 3-11 10Zm15 11c7-1 11-5 12-12-8 0-12 4-12 12ZM8 32c7 0 11-3 13-10-8 0-12 3-13 10Z" fill="currentColor" opacity=".72" />
      <path d="M17 18h11M16 31h12" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
