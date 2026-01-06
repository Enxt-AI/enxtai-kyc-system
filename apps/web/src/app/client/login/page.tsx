// Client login redirect page

import { redirect } from 'next/navigation';

/**
 * Client Login Page
 *
 * Redirects to the main login form.
 */
export default function Page() {
  redirect('/login');
}
