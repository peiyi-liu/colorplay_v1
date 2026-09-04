import { Icon } from '../../../components/ui/icons';

interface PasswordVisibilityToggleProps {
  controlId: string;
  fieldLabel: string;
  onToggle: () => void;
  visible: boolean;
}

export function PasswordVisibilityToggle({
  controlId,
  fieldLabel,
  onToggle,
  visible,
}: PasswordVisibilityToggleProps) {
  const action = visible ? '隱藏' : '顯示';

  return (
    <button
      aria-controls={controlId}
      aria-label={`${action}${fieldLabel}`}
      aria-pressed={visible}
      className="login-form__password-toggle"
      data-tooltip={`${action}${fieldLabel}`}
      onClick={onToggle}
      type="button"
    >
      <Icon name={visible ? 'eye-off' : 'eye'} size={22} />
    </button>
  );
}
