import { Icon } from './icons';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastTone = 'success' | 'error' | 'info';

type ToastInput = Readonly<{ message: string; tone: ToastTone }>;

type ToastEntry = Readonly<{ id: number; message: string; tone: ToastTone }>;

type ToastFn = (input: ToastInput) => void;

const ToastContext = createContext<ToastFn | null>(null);

const AUTO_DISMISS_MS = 4000;

/** 右上角系統通知（GGAME toast-container）。錯誤用 alert 積極播報。 */
export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<readonly ToastEntry[]>([]);
  const nextId = useRef(1);

  const toast = useCallback<ToastFn>(({ message, tone }) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((previous) => [...previous, { id, message, tone }]);
    setTimeout(() => {
      setToasts((previous) => previous.filter((entry) => entry.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-label="系統通知" className="ui-toast-container" role="region">
        {toasts.map((entry) => (
          <div
            className={`ui-toast ui-toast--${entry.tone} animate-fade-in`}
            key={entry.id}
            role={entry.tone === 'error' ? 'alert' : 'status'}
          >
            <span aria-hidden="true">
              {entry.tone === 'success' ? (
                <Icon name="check" size={15} />
              ) : entry.tone === 'error' ? (
                <Icon name="alert" size={15} />
              ) : (
                <Icon name="info" size={15} />
              )}
            </span>
            <span>{entry.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('TOAST_PROVIDER_MISSING');
  return toast;
}
