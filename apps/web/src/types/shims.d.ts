// Minimal JSX fallback to satisfy editor when Next types are unavailable.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

declare module 'next/font/google' {
  export function Inter(options: { subsets: string[] }): { className: string };
}

declare module 'next' {
  export type Metadata = {
    title?: string;
    description?: string;
    icons?: any;
  };
}

declare module 'picojs';
