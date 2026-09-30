import { TriangleAlert } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

// One confirmation pattern (UI_UX_IMPROVEMENT_PLAN.md DS7): says what will
// happen and whether it can be undone, focuses Cancel first, and can't be
// closed while the action runs. `children` goes between the text and the
// buttons (extra inputs, e.g. a reason).
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busyLabel,
  cancelLabel = 'Cancel',
  tone = 'destructive',
  irreversible = false,
  busy = false,
  onConfirm,
  onCloseAutoFocus,
  children,
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tone === 'destructive' && <TriangleAlert className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />}
            {title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-left text-sm text-muted-foreground">
              {typeof description === 'string' ? <p>{description}</p> : description}
              {irreversible && <p className="font-bold text-foreground">This can't be undone.</p>}
            </div>
          </DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button type="button" variant="outline" autoFocus onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone} onClick={onConfirm} loading={busy}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
