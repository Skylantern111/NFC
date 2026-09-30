import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import AmbientBackground from '../../components/AmbientBackground';
import TopNav from '../../components/nav/TopNav';
import GlassCard from '../../components/GlassCard';
import SignupForm from '../../components/SignupForm';
import { setPageTitle } from '../../lib/pageTitle';

// Owner signup. Admin accounts are created on a separate page
// (/admin/register, admin/AdminRegister.jsx) — this form never grants admin.
export default function Register() {
  useEffect(() => {
    setPageTitle('Create account');
    return () => setPageTitle('');
  }, []);
  return (
    <>
      <AmbientBackground />
      <div className="relative flex min-h-screen flex-col">
        <TopNav fallback="/" />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-8">
          <h1 className="text-center font-display text-3xl font-bold uppercase tracking-tight text-foreground">Create account</h1>
          <p className="mb-6 mt-1 text-center text-sm text-muted-foreground">
            Free. Takes a minute. Then claim your first tag.
          </p>
          <GlassCard>
            <SignupForm />
          </GlassCard>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Have an account?{' '}
            <Link to="/login" className="font-bold text-primary hover:underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </main>
      </div>
    </>
  );
}
