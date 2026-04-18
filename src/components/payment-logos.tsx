import React from "react";

export function PayFastLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/payment_gateways/payfast.png"
      alt="PayFast"
      width={size * 3}
      height={size}
      style={{ maxHeight: size, maxWidth: size * 3 }}
      className={`inline-block object-contain ${className}`}
    />
  );
}

export function OzowLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/payment_gateways/ozow.png"
      alt="Ozow"
      width={size * 3}
      height={size}
      style={{ maxHeight: size, maxWidth: size * 3 }}
      className={`inline-block object-contain ${className}`}
    />
  );
}

export function EftIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/payment_gateways/fnb.png"
      alt="FNB Bank Transfer"
      width={size}
      height={size}
      style={{ maxHeight: size, maxWidth: size }}
      className={`inline-block object-contain ${className}`}
    />
  );
}
