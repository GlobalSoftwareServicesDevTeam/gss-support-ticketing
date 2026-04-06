import React from "react";

export function PayFastLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="40" height="40" rx="8" fill="#00457C" />
      <path
        d="M8 14h7.5c3.6 0 5.8 2 5.8 4.8 0 2.9-2.2 4.9-5.8 4.9H12v5.3H8V14zm7.1 6.8c1.4 0 2.2-.7 2.2-1.9s-.8-1.9-2.2-1.9H12v3.8h3.1z"
        fill="white"
      />
      <path
        d="M22 14h12v3.2h-8.1v2.5h7.1v3h-7.1v6.3H22V14z"
        fill="#00C1DE"
      />
    </svg>
  );
}

export function OzowLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="40" height="40" rx="8" fill="#1A1A2E" />
      <path
        d="M10 20c0-4.4 3.1-7.5 7.2-7.5 4.1 0 7.2 3.1 7.2 7.5s-3.1 7.5-7.2 7.5C13.1 27.5 10 24.4 10 20zm10.8 0c0-2.5-1.5-4.2-3.6-4.2s-3.6 1.7-3.6 4.2 1.5 4.2 3.6 4.2 3.6-1.7 3.6-4.2z"
        fill="#23C4A0"
      />
      <path
        d="M25.5 12.9h3.9l3.4 6.7 3.4-6.7h3.8l-5.3 14.2h-3.9l-5.3-14.2z"
        fill="#23C4A0"
      />
    </svg>
  );
}

export function EftIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="40" height="40" rx="8" fill="#F97316" />
      <path
        d="M10 13h20v3H10v-3zM12 18h16v2H12v-2zM14 22h12v2H14v-2zM10 26h20v3H10v-3z"
        fill="white"
        opacity="0.9"
      />
    </svg>
  );
}
