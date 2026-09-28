import { useEffect } from 'react';
import BackButton from './BackButton';
import { setPageTitle } from '../lib/pageTitle';

// Every page's title block (UI_UX_IMPROVEMENT_PLAN.md DS4): answers "where
// am I?" the same way everywhere, names the browser tab (A11Y5), and gives
// the page's main action one fixed place (top right, or under the title on
// phones).
export default function PageHeader({ title, description, backTo, backLabel = 'Back', actions, documentTitle }) {
  useEffect(() => {
    setPageTitle(documentTitle ?? (typeof title === 'string' ? title : ''));
    return () => setPageTitle('');
  }, [title, documentTitle]);

  return (
    <div className="mb-6 space-y-3">
      {backTo && <BackButton fallback={backTo} label={backLabel} className="-ml-1 min-h-11" />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
