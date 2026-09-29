import { Component } from 'react';
import { reportError } from '../lib/errorLog';
import { ErrorScreen, newErrorRef } from './ErrorBoundary';

// Guards the lazy-loaded dashboard/admin routes in App.jsx: if a chunk
// import() fails (stale deploy, offline mid-navigation), React's default
// behavior is an unhandled error and a blank screen. This catches that and
// offers a reload instead of leaving the user wondering if the app is frozen.
export default class RouteErrorBoundary extends Component {
  state = { hasError: false, error: null, errorRef: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error, errorRef: newErrorRef() };
  }

  componentDidCatch(error) {
    reportError(error, `RouteErrorBoundary [ref ${this.state.errorRef}]`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorScreen
          title="This page didn't load"
          message="Check your connection, then try again. Reloading gets the latest version of TagBack."
          errorRef={this.state.errorRef}
          error={this.state.error}
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
