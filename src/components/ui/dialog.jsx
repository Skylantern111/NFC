import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import * as React from "react";
import { useReturnFocus } from "@/hooks/useReturnFocus";

// Context to track composition state across dialog children
const DialogCompositionContext = React.createContext({
  isComposing: () => false,
  setComposing: () => {},
  justEndedComposing: () => false,
  markCompositionEnd: () => {},
});

export const useDialogComposition = () =>
  React.useContext(DialogCompositionContext);

function Dialog({ ...props }) {
  const composingRef = React.useRef(false);
  const justEndedRef = React.useRef(false);
  const endTimerRef = React.useRef(null);

  const contextValue = React.useMemo(
    () => ({
      isComposing: () => composingRef.current,
      setComposing: (composing) => {
        composingRef.current = composing;
      },
      justEndedComposing: () => justEndedRef.current,
      markCompositionEnd: () => {
        justEndedRef.current = true;
        if (endTimerRef.current) {
          clearTimeout(endTimerRef.current);
        }
        endTimerRef.current = setTimeout(() => {
          justEndedRef.current = false;
        }, 150);
      },
    }),
    []
  );

  return (
    <DialogCompositionContext.Provider value={contextValue}>
      <DialogPrimitive.Root data-slot="dialog" {...props} />
    </DialogCompositionContext.Provider>
  );
}

function DialogTrigger({ ...props }) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

const DialogOverlay = React.forwardRef(function DialogOverlay(
  { className, ...props },
  ref
) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/60",
        className
      )}
      {...props}
    />
  );
});

DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef(function DialogContent(
  {
    className,
    children,
    showCloseButton = true,
    onEscapeKeyDown,
    onOpenAutoFocus,
    onCloseAutoFocus,
    ...props
  },
  ref
) {
  const { isComposing } = useDialogComposition();

  const handleEscapeKeyDown = React.useCallback(
    (e) => {
      // Check both the native isComposing property and our context state
      // This handles Safari's timing issues with composition events
      const isCurrentlyComposing = e.isComposing || isComposing();

      // If IME is composing, prevent dialog from closing
      if (isCurrentlyComposing) {
        e.preventDefault();
        return;
      }

      // Call user's onEscapeKeyDown if provided
      onEscapeKeyDown?.(e);
    },
    [isComposing, onEscapeKeyDown]
  );

  const returnFocus = useReturnFocus(onOpenAutoFocus, onCloseAutoFocus);

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        className={cn(
          // Phones: a bottom sheet in thumb reach, safe-area aware. From `sm`: the
          // usual centered dialog (UI_UX_IMPROVEMENT_PLAN.md B.10).
          "bg-card data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed z-50 grid w-full gap-4 border-2 border-foreground p-6 shadow-brut-xl duration-200 max-h-[90dvh] overflow-y-auto",
          "inset-x-0 bottom-0 rounded-t-lg border-b-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom-10 data-[state=closed]:slide-out-to-bottom-10",
          "sm:inset-x-auto sm:bottom-auto sm:top-[50%] sm:left-[50%] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border-b-2 sm:pb-6 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
          className
        )}
        onEscapeKeyDown={handleEscapeKeyDown}
        {...returnFocus}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

const DialogHeader = React.forwardRef(function DialogHeader(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
});

const DialogFooter = React.forwardRef(function DialogFooter(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="dialog-footer"
      className={cn(
        // Phones: full-width stack, main (last) action at the bottom.
        "flex flex-col gap-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto",
        className
      )}
      {...props}
    />
  );
});

const DialogTitle = React.forwardRef(function DialogTitle(
  { className, ...props },
  ref
) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      data-slot="dialog-title"
      className={cn("font-display text-lg leading-snug font-bold", className)}
      {...props}
    />
  );
});

const DialogDescription = React.forwardRef(function DialogDescription(
  { className, ...props },
  ref
) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
});

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
};
