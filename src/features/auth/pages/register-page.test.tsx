import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../../components/ui/toast';
import { AccountFlowError } from '../api/account-flows';
import { RegisterPage } from './register-page';

const flows = vi.hoisted(() => ({
  completeStudentRegistration: vi.fn(),
  navigate: vi.fn(),
  sendRegistrationOtp: vi.fn(),
  verifyRegistrationOtp: vi.fn(),
}));

vi.mock('../api/account-flows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/account-flows')>();
  return { ...actual, ...flows };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => flows.navigate };
});

const renderRegisterPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <RegisterPage />
      </ToastProvider>
    </MemoryRouter>,
  );

const fillRegistration = () => {
  fireEvent.change(screen.getByLabelText('名字'), {
    target: { value: ' 王小明 ' },
  });
  fireEvent.change(screen.getByLabelText('暱稱'), {
    target: { value: ' 小明 ' },
  });
  fireEvent.change(screen.getByLabelText('班級序號'), {
    target: { value: ' 1234-5678-90AB-CDEF ' },
  });
  fireEvent.change(screen.getByLabelText('E-mail'), {
    target: { value: 'student@colorplay.invalid' },
  });
  fireEvent.change(screen.getByLabelText('帳號（學號）'), {
    target: { value: ' 11500001 ' },
  });
  fireEvent.change(screen.getByLabelText('密碼'), {
    target: { value: 'PassWord1' },
  });
  fireEvent.change(screen.getByLabelText('密碼確認'), {
    target: { value: 'PassWord1' },
  });
};

const verifyEmail = async () => {
  fireEvent.click(screen.getByRole('button', { name: '傳送驗證碼' }));
  await waitFor(() => {
    expect(flows.sendRegistrationOtp).toHaveBeenCalledWith(
      'student@colorplay.invalid',
    );
  });
  fireEvent.change(screen.getByLabelText('E-mail 驗證碼'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: '確認驗證' }));
  await waitFor(() => {
    expect(flows.verifyRegistrationOtp).toHaveBeenCalledWith(
      'student@colorplay.invalid',
      '123456',
    );
  });
};

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flows.completeStudentRegistration.mockResolvedValue(undefined);
    flows.sendRegistrationOtp.mockResolvedValue(undefined);
    flows.verifyRegistrationOtp.mockResolvedValue(undefined);
  });

  it('renders the ggame register card with title and brand', () => {
    renderRegisterPage();

    expect(
      screen.getByRole('heading', { name: '註冊帳號' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ColorPlay 認證入口')).toBeInTheDocument();
    expect(screen.getByText('學生入口')).toBeInTheDocument();
    expect(document.querySelector('.auth-portal')).toHaveAttribute(
      'data-portal',
      'student',
    );
  });

  it('gives the primary submit action the yellow student style, never the teacher variant', () => {
    renderRegisterPage();

    const submit = screen.getByRole('button', { name: '完成註冊' });
    expect(submit).toHaveClass('primary-action');
    expect(submit).not.toHaveClass('login-form__submit--teacher');
  });

  it('groups the labeled fields the DC spec requires', () => {
    renderRegisterPage();

    expect(screen.getByLabelText('名字')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('暱稱')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('班級序號')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('帳號（學號）')).toHaveAttribute(
      'type',
      'text',
    );
    expect(screen.getByLabelText('密碼')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('密碼確認')).toHaveAttribute(
      'type',
      'password',
    );
    expect(
      screen.getByRole('button', { name: '傳送驗證碼' }),
    ).toBeInTheDocument();
  });

  it('links back to login for existing accounts', () => {
    renderRegisterPage();

    expect(
      screen.getByRole('link', { name: '已有帳號？返回登入' }),
    ).toHaveAttribute('href', '/login');
  });

  it('moves through OTP states and recovers from send and verification failures', async () => {
    flows.sendRegistrationOtp
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    flows.verifyRegistrationOtp.mockRejectedValueOnce(new Error('expired'));
    renderRegisterPage();
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'student@colorplay.invalid' },
    });

    fireEvent.click(screen.getByRole('button', { name: '傳送驗證碼' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '驗證碼寄送失敗，請稍後重試',
      );
    });
    expect(screen.getByRole('button', { name: '傳送驗證碼' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '傳送驗證碼' }));
    await screen.findByLabelText('E-mail 驗證碼');
    fireEvent.click(screen.getByRole('button', { name: '確認驗證' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '請輸入收到的 6 碼驗證碼',
      );
    });
    fireEvent.change(screen.getByLabelText('E-mail 驗證碼'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: '確認驗證' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '驗證碼不正確或已過期，請重試',
      );
    });
    expect(screen.getByRole('button', { name: '確認驗證' })).toBeEnabled();
  });

  it('trims verified registration input before server submission, then toasts and navigates', async () => {
    renderRegisterPage();
    fillRegistration();

    await verifyEmail();
    await screen.findByText('✓ 已認證');
    expect(screen.getByLabelText('E-mail')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '完成註冊' }));

    await waitFor(() => {
      expect(flows.completeStudentRegistration).toHaveBeenCalledWith({
        account: '11500001',
        classCode: '1234-5678-90AB-CDEF',
        fullName: '王小明',
        nickname: '小明',
        password: 'PassWord1',
      });
    });
    expect(
      await screen.findByText('註冊成功，歡迎加入 ColorPlay！'),
    ).toBeVisible();
    expect(flows.navigate).toHaveBeenCalledWith('/app', { replace: true });
  });

  it('shows the stable account-taken message after verified registration fails', async () => {
    flows.completeStudentRegistration.mockRejectedValueOnce(
      new AccountFlowError('ACCOUNT_TAKEN'),
    );
    renderRegisterPage();
    fillRegistration();

    await verifyEmail();
    fireEvent.click(screen.getByRole('button', { name: '完成註冊' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '這個帳號（學號）已被使用',
      );
    });
    expect(flows.navigate).not.toHaveBeenCalled();
  });
});
