import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Component } from "react";
import { reportError } from "@/lib/errorLog";
import { Button } from "./ui/button";

// Short code a person can quote to an admin; it is also put into the
// clientErrors message, so admin/Errors.jsx can find the matching report.
export function newErrorRef() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// The friendly crash screen shared by ErrorBoundary and RouteErrorBoundary.
// No stack traces or file paths for normal users — those go to the error
// log (lib/errorLog.js); a dev build still shows them for debugging.
export function ErrorScreen({ title = "Something went wrong", message, errorRef, onRetry, error }) {
  return (
    <div role="alert" className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-base px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning-soft">
        <AlertTriangle className="h-6 w-6 text-foreground" aria-hidden="true" />
      </span>
      <div className="max-w-sm space-y-1.5">
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {message || "This page couldn't load properly. Please try again."}
        </p>
        {errorRef && (
          <p className="text-xs text-muted-foreground">
            If it keeps happening, tell TagBack this code: <span className="font-mono font-semibold">{errorRef}</span>
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" className="gap-1.5" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Try again
        </Button>
        <Button asChild variant="secondary" className="gap-1.5">
          <a href="/">
            <Home className="h-4 w-4" aria-hidden="true" /> Go home
          </a>
        </Button>
      </div>
      {import.meta.env.DEV && error?.stack && (
        <details className="w-full max-w-2xl text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer">Developer details</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-xl border-2 border-foreground bg-card p-3">{error.stack}</pre>
        </details>
      )}
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorRef: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, errorRef: newErrorRef() };
  }

  componentDidCatch(error) {
    reportError(error, `ErrorBoundary [ref ${this.state.errorRef}]`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorScreen
          errorRef={this.state.errorRef}
          error={this.state.error}
          onRetry={() => this.setState({ hasError: false, error: null, errorRef: null })}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
