import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { firebaseReady } from '../../firebase/config';
import SignupForm from '../../components/SignupForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Admin account signup — separate from the owner signup (auth/Register.jsx).
// Same look as AdminLogin (solid "ops console" surface, amber accent).
// Requires the admin signup passcode an existing admin sets on
// admin/Owners.jsx; firestore.rules checks it, not this page.
export default function AdminRegister() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base px-5 py-8">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning-soft text-foreground">
          <ShieldAlert className="h-5.5 w-5.5" />
        </span>
        <h1 className="text-2xl font-extrabold text-foreground">Create admin account</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          For TagBack staff only. You need the admin passcode from an existing admin.
        </p>
      </div>
      <Card className="w-full max-w-sm rounded-lg border-2 border-foreground bg-card shadow-card">
        <CardHeader className="sr-only">
          <CardTitle>Admin sign up</CardTitle>
          <CardDescription>Create an admin account with the admin passcode.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <SignupForm admin />
        </CardContent>
      </Card>
      <div className="mt-5 flex max-w-sm flex-col items-center gap-1.5 text-center text-sm text-muted-foreground">
        <Link to="/admin/login" className="hover:text-foreground">
          Already an admin? Sign in
        </Link>
        <Link to="/register" className="hover:text-foreground">
          Not staff? Create a regular account
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">
          Already have a regular account with this email? Ask an admin to grant access instead — this page only creates
          new accounts.
        </p>
      </div>
      {!firebaseReady && (
        <p className="mt-4 text-center text-xs text-foreground">Firebase not configured — sign-up is stubbed for preview.</p>
      )}
    </div>
  );
}
