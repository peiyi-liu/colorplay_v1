import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type StudentBackOverride = Readonly<{
  ariaLabel: string;
  onBack: () => void;
}>;

type StudentBackNavigationValue = Readonly<{
  activeOverride: StudentBackOverride | null;
  registerOverride: (override: StudentBackOverride) => () => void;
}>;

const StudentBackNavigationContext =
  createContext<StudentBackNavigationValue | null>(null);

export function StudentBackNavigationProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [activeOverride, setActiveOverride] =
    useState<StudentBackOverride | null>(null);
  const registerOverride = useCallback((override: StudentBackOverride) => {
    setActiveOverride(override);
    return () => {
      setActiveOverride((current) => (current === override ? null : current));
    };
  }, []);
  const value = useMemo(
    () => ({ activeOverride, registerOverride }),
    [activeOverride, registerOverride],
  );

  return (
    <StudentBackNavigationContext.Provider value={value}>
      {children}
    </StudentBackNavigationContext.Provider>
  );
}

export function useStudentBackNavigation() {
  return useContext(StudentBackNavigationContext)?.activeOverride ?? null;
}

export function useStudentBackOverride(override: StudentBackOverride) {
  const registerOverride = useContext(
    StudentBackNavigationContext,
  )?.registerOverride;
  const onBackRef = useRef(override.onBack);

  useEffect(() => {
    onBackRef.current = override.onBack;
  }, [override.onBack]);

  useEffect(() => {
    if (!registerOverride) return;
    return registerOverride({
      ariaLabel: override.ariaLabel,
      onBack: () => {
        onBackRef.current();
      },
    });
  }, [override.ariaLabel, registerOverride]);
}
