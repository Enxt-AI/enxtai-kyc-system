import React from 'react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 text-center">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold">KYC System</h1>
        <p className="text-gray-600">Start the KYC flow from here.</p>
        <Link
          href="/kyc/upload"
          className="inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Begin KYC
        </Link>
      </div>
    </main>
  );
}
