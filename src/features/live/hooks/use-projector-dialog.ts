import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

const PROJECTOR_DIALOG_HISTORY_KEY = 'colorplayLiveProjectorDialog';

export function useProjectorDialog<DialogName extends string>() {
  const [dialog, setDialog] = useState<DialogName | null>(null);
  const dialogOpenRef = useRef(false);
  const historyEntryRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dialogWasOpenRef = useRef(false);

  const closeDialog = useCallback((fromHistory = false) => {
    dialogOpenRef.current = false;
    setDialog(null);
    if (fromHistory || !historyEntryRef.current) {
      historyEntryRef.current = false;
      return;
    }
    historyEntryRef.current = false;
    window.history.back();
  }, []);

  const openDialog = useCallback(
    (nextDialog: DialogName, trigger: HTMLElement | null) => {
      returnFocusRef.current = trigger;
      if (!dialogOpenRef.current) {
        dialogOpenRef.current = true;
        try {
          const historyState: unknown = window.history.state;
          const currentState =
            typeof historyState === 'object' && historyState
              ? (historyState as Record<string, unknown>)
              : {};
          window.history.pushState(
            { ...currentState, [PROJECTOR_DIALOG_HISTORY_KEY]: true },
            '',
            window.location.href,
          );
          historyEntryRef.current = true;
        } catch {
          historyEntryRef.current = false;
        }
      }
      setDialog(nextDialog);
    },
    [],
  );

  useEffect(() => {
    const handlePopState = () => {
      if (dialogOpenRef.current) closeDialog(true);
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [closeDialog]);

  useEffect(() => {
    if (dialog) {
      dialogWasOpenRef.current = true;
      return;
    }
    if (dialogWasOpenRef.current) {
      dialogWasOpenRef.current = false;
      returnFocusRef.current?.focus();
    }
  }, [dialog]);

  useEffect(
    () => () => {
      dialogOpenRef.current = false;
      if (historyEntryRef.current) {
        historyEntryRef.current = false;
        window.history.back();
      }
    },
    [],
  );

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
    );
    const first = buttons[0];
    const last = buttons.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { closeDialog, dialog, handleDialogKeyDown, openDialog } as const;
}
