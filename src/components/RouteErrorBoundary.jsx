import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';

// Guards the lazy-loaded dashboard/admin routes in App.jsx: if a chunk
// import() fails (stale deploy, offline mid-navigation), React's default
// behavior is an unhandled error and a blank screen. This catches that and
// offers a reload instead of leaving the user wondering if the app is frozen.
export default class RouteErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-base px-4 text-center text-slate-500 dark:text-slate-400">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <p className="font-semibold text-slate-800 dark:text-slate-100">Failed to load this page.</p>
          <p className="text-sm">Check your connection and try again.</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
