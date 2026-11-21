import type { ReactNode } from 'react';
import { AlertDialog as RadixAlertDialog } from 'radix-ui';
import { Button } from './button';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
}

/** Accessible confirmation modal backed by Radix AlertDialog. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <RadixAlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs" />
        <RadixAlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(calc(100%-2rem),28rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-strong bg-surface p-6 shadow-lg">
          <RadixAlertDialog.Title className="text-lg font-bold text-text">
            {title}
          </RadixAlertDialog.Title>
          <RadixAlertDialog.Description className="mt-2 text-sm leading-6 text-text-muted">
            {description}
          </RadixAlertDialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <RadixAlertDialog.Cancel asChild>
              <Button type="button" variant="outline" disabled={isLoading}>
                {cancelLabel}
              </Button>
            </RadixAlertDialog.Cancel>
            <RadixAlertDialog.Action asChild>
              <Button
                type="button"
                variant={destructive ? 'destructive' : 'default'}
                disabled={isLoading}
                onClick={(event) => {
                  event.preventDefault();
                  void onConfirm();
                }}
              >
                {confirmLabel}
              </Button>
            </RadixAlertDialog.Action>
          </div>
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
  );
}
