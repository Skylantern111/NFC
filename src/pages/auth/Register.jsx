import { Link } from 'react-router-dom';
import AmbientBackground from '../../components/AmbientBackground';
import TopNav from '../../components/nav/TopNav';
import GlassCard from '../../components/GlassCard';
import SignupForm from '../../components/SignupForm';

// Owner signup. Admin accounts are created on a separate page
// (/admin/register, admin/AdminRegister.jsx) — this form never grants admin.
export default function Register() {
  return (
    <>
      <AmbientBackground />
      <div className="relative flex min-h-screen flex-col">
        <TopNav fallback="/" />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-8">
          <h1 className="mb-6 text-center text-3xl font-extrabold text-slate-800 dark:text-slate-100">
            Create account
          </h1>
          <GlassCard>
            <SignupForm />
          </GlassCard>
          <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
            Have an account?{' '}
            <Link to="/login" className="font-semibold text-purple-600 hover:text-pink-600">
              Sign in
            </Link>
          </p>
        </main>
      </div>
    </>
  );
}
