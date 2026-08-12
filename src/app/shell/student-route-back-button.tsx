import { useEffect, useRef, useState } from 'react';
import {
  NavigationType,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';

import { useStudentBackNavigation } from './student-back-navigation';
import './student-route-back-button.css';

type StudentHistoryEntry = Readonly<{
  key: string;
  pathname: string;
}>;

export function StudentRouteBackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const activeOverride = useStudentBackNavigation();
  const history = useRef<StudentHistoryEntry[]>([
    { key: location.key, pathname: location.pathname },
  ]);
  const [hasPreviousStudentPage, setHasPreviousStudentPage] = useState(false);

  useEffect(() => {
    const knownIndex = history.current.findIndex(
      (entry) => entry.key === location.key,
    );

    if (knownIndex >= 0) {
      history.current = history.current.slice(0, knownIndex + 1);
    } else if (navigationType === NavigationType.Replace) {
      history.current[history.current.length - 1] = {
        key: location.key,
        pathname: location.pathname,
      };
    } else if (navigationType === NavigationType.Push) {
      history.current.push({
        key: location.key,
        pathname: location.pathname,
      });
    } else {
      history.current = [{ key: location.key, pathname: location.pathname }];
    }

    setHasPreviousStudentPage(history.current.length > 1);
  }, [location.key, location.pathname, navigationType]);

  if (location.pathname === '/app') return null;

  return (
    <button
      aria-label={activeOverride?.ariaLabel ?? '返回前一頁'}
      className="student-route-back"
      onClick={() => {
        if (activeOverride) {
          activeOverride.onBack();
          return;
        }
        if (hasPreviousStudentPage) {
          void navigate(-1);
          return;
        }
        void navigate('/app');
      }}
      type="button"
    >
      <span aria-hidden="true" className="student-route-back__arrow">
        ←
      </span>
      <span>返回</span>
    </button>
  );
}
