import { AccountFlowError } from '../api/account-flows';

export type EmailVerification =
  'idle' | 'sending' | 'sent' | 'verifying' | 'verified';

export type RegisterStep = 'basic' | 'email' | 'credentials';

const registerErrorMessages: Readonly<Record<string, string>> = {
  ACCOUNT_TAKEN: '這個帳號（學號）已被使用',
  ACCOUNT_LOOKUP_FAILED: '無法確認帳號是否可用，請稍後再試。',
  ALREADY_IN_ACTIVE_CLASSROOM: '此帳號已加入其他班級，請聯絡老師辦理轉班',
  ALREADY_REGISTERED: '此 E-mail 已完成註冊，請返回登入',
  CLASSROOM_JOIN_FAILED: '加入班級失敗，請確認班級序號後再試。',
  CLASSROOM_JOIN_RATE_LIMITED: '嘗試次數過多，請等待 10 分鐘後再試。',
  CLASSROOM_LOOKUP_FAILED: '無法確認班級資料，請稍後再試。',
  MEMBERSHIP_LOOKUP_FAILED: '無法確認班級加入狀態，請稍後再試。',
  PASSWORD_SETUP_FAILED: '密碼設定失敗，請重新輸入後再試。',
  PROFILE_LOOKUP_FAILED: '無法確認 E-mail 的註冊狀態，請稍後再試。',
  PROFILE_SETUP_FAILED: '基本資料儲存失敗，請檢查內容後再試。',
  REGISTRATION_FINALIZE_FAILED: '註冊尚未完成，請再按一次「完成註冊」。',
  REGISTER_IN_PROGRESS: '註冊正在處理中，請稍候再試',
  REGISTRATION_STATE_FAILED: '無法建立註冊作業，請稍後再試。',
  EMAIL_NOT_VERIFIED: '請先完成 E-mail 認證',
  INVALID_CLASSROOM_CODE: '班級序號無效，請向老師確認',
  NICKNAME_BANNED: '暱稱包含不適當字詞，請重新命名',
  NICKNAME_EMOJI: '暱稱不能使用表情符號',
  NICKNAME_LENGTH: '暱稱需為 2 至 16 個字',
  WEAK_PASSWORD: '密碼需為 6 至 12 碼並包含大小寫英文字母',
};

export const messageForRegisterError = (error: unknown) =>
  error instanceof AccountFlowError
    ? (registerErrorMessages[error.code] ??
      '系統暫時無法完成註冊，請稍後再試。')
    : '系統暫時無法完成註冊，請稍後再試。';

const stepItems = [
  { id: 'basic', label: '基本資料', number: 1 },
  { id: 'email', label: 'E-mail 驗證', number: 2 },
  { id: 'credentials', label: '帳號與密碼', number: 3 },
] as const satisfies readonly {
  id: RegisterStep;
  label: string;
  number: number;
}[];

const stepNumber = (step: RegisterStep) =>
  stepItems.find((item) => item.id === step)?.number ?? 1;

export function RegisterProgress({
  currentStep,
  furthestStep,
  onSelect,
}: Readonly<{
  currentStep: RegisterStep;
  furthestStep: RegisterStep;
  onSelect(step: RegisterStep): void;
}>) {
  const furthestNumber = stepNumber(furthestStep);

  return (
    <ol aria-label="註冊步驟" className="auth-register-progress">
      {stepItems.map((item) => {
        const reached = item.number <= furthestNumber;
        return (
          <li data-active={currentStep === item.id} key={item.id}>
            <button
              aria-current={currentStep === item.id ? 'step' : undefined}
              disabled={!reached}
              onClick={() => {
                onSelect(item.id);
              }}
              type="button"
            >
              <b aria-hidden="true">{String(item.number)}</b>
              {item.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
