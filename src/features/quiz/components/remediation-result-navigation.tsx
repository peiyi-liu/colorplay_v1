import { Link, useNavigate } from 'react-router-dom';

import { useStudentBackOverride } from '../../../app/shell/student-back-navigation';

export function RemediationResultNavigation({ to }: Readonly<{ to: string }>) {
  const navigate = useNavigate();
  useStudentBackOverride({
    ariaLabel: '返回我的錯題',
    onBack: () => {
      void navigate(to);
    },
  });
  return (
    <Link className="primary-action" data-primary-action="true" to={to}>
      返回我的錯題
    </Link>
  );
}
