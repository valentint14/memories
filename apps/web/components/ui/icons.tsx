/** Iconițe cu contur, în culoarea textului; doar funcționale, niciodată decorative. */

export function CheckIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

export function PlusIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function CameraIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M2.5 6.5h3l1.5-2h6l1.5 2h3v9h-15z" />
      <circle cx="10" cy="11" r="3" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

export function CloseIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
