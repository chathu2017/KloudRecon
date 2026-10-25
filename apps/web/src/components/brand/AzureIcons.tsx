import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The Microsoft Azure mark, from the official Azure architecture icon set
 * (`public/azure-icons/other/azure-a.svg`), inlined so prerendered pages need no image request.
 * Used only to say "this is your Azure" (decision 0045).
 */
export function AzureLogo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" className={cn('size-5', className)} aria-hidden focusable="false" {...props}>
      <path
        d="M5.33492 1.37491C5.44717 1.04229 5.75909 0.818359 6.11014 0.818359H11.25L5.91513 16.6255C5.80287 16.9581 5.49095 17.182 5.13991 17.182H1.13968C0.579936 17.182 0.185466 16.6325 0.364461 16.1022L5.33492 1.37491Z"
        fill="url(#kr-az-0)"
      />
      <path
        d="M13.5517 11.4546H5.45126C5.1109 11.4546 4.94657 11.8715 5.19539 12.1037L10.4005 16.9618C10.552 17.1032 10.7515 17.1819 10.9587 17.1819H15.5453L13.5517 11.4546Z"
        fill="#0078D4"
      />
      <path
        d="M6.11014 0.818359C5.75909 0.818359 5.44717 1.04229 5.33492 1.37491L0.364461 16.1022C0.185466 16.6325 0.579936 17.182 1.13968 17.182H5.13991C5.49095 17.182 5.80287 16.9581 5.91513 16.6255L6.90327 13.6976L10.4005 16.9617C10.552 17.1032 10.7515 17.1818 10.9588 17.1818H15.5454L13.5517 11.4545H7.66032L11.25 0.818359H6.11014Z"
        fill="url(#kr-az-1)"
      />
      <path
        d="M12.665 1.37478C12.5528 1.04217 12.2409 0.818237 11.8898 0.818237H6.13629H6.16254C6.51358 0.818237 6.82551 1.04217 6.93776 1.37478L11.9082 16.1021C12.0872 16.6324 11.6927 17.1819 11.133 17.1819H11.0454H16.8603C17.42 17.1819 17.8145 16.6324 17.6355 16.1021L12.665 1.37478Z"
        fill="url(#kr-az-2)"
      />
      <defs>
        <linearGradient id="kr-az-0" x1="6.07512" y1="1.38476" x2="0.738178" y2="17.1514" gradientUnits="userSpaceOnUse">
          <stop stopColor="#114A8B" />
          <stop offset="1" stopColor="#0669BC" />
        </linearGradient>
        <linearGradient id="kr-az-1" x1="10.3402" y1="11.4564" x2="9.107" y2="11.8734" gradientUnits="userSpaceOnUse">
          <stop stopOpacity="0.3" />
          <stop offset="0.0711768" stopOpacity="0.2" />
          <stop offset="0.321031" stopOpacity="0.1" />
          <stop offset="0.623053" stopOpacity="0.05" />
          <stop offset="1" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="kr-az-2" x1="9.45858" y1="1.38467" x2="15.3168" y2="16.9926" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3CCBF4" />
          <stop offset="1" stopColor="#2892DF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** A sky-blue cloud: stands for "the cloud" wherever the UI talks about a cloud estate. */
export function SkyCloud({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 46" className={cn('size-5', className)} aria-hidden focusable="false" {...props}>
      <defs>
        <linearGradient id="kr-sky-0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A9DEFF" />
          <stop offset="0.55" stopColor="#5DB4F2" />
          <stop offset="1" stopColor="#2F8DE0" />
        </linearGradient>
        <linearGradient id="kr-sky-1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M18 42A12 12 0 0 1 16.4 18.1 16 16 0 0 1 47.3 14.6 13.75 13.75 0 0 1 48.5 42Z" fill="url(#kr-sky-0)" />
      <path d="M19.5 22.5A12.5 12.5 0 0 1 43 15.5C36 12.5 25 14 19.5 22.5Z" fill="url(#kr-sky-1)" />
    </svg>
  );
}
