// Client login redirect page

import { redirect } from 'next/navigation';

/**
 * Client Login Page
 *
 * Redirects to the client admin login form at /client-login.
 *
 * @remarks
 * This route exists for backward compatibility and convenience.
 * Users accessing /client/login are automatically redirected to /client-login.
 */
export default function Page() {
  redirect('/client-login');
}
