/** A ledger page: three ruled lines, the last one inked in the accent. */
export function BrandMark() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
      <rect x="2" y="1.5" width="18" height="19" rx="3" className="fill-board" />
      <path
        d="M6.5 7.5h9M6.5 11h9"
        className="stroke-board-type"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M6.5 14.5h5" className="stroke-accent" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
