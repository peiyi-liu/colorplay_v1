import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../../components/ui/toast';
import { AuthContext } from '../context/auth-context';
import {
  AccountFlowError,
  completeStudentRegistration,
  sendRegistrationOtp,
  verifyRegistrationOtp,
} from '../api/account-flows';
import { RegisterPage } from './register-page';

vi.mock('../api/account-flows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/account-flows')>();
  return {
    ...actual,
    completeStudentRegistration: vi.fn(() => Promise.resolve()),
    sendRegistrationOtp: vi.fn(() => Promise.resolve()),
    verifyRegistrationOtp: vi.fn(() => Promise.resolve()),
  };
});

const mockedCompleteStudentRegistration = vi.mocked(
  completeStudentRegistration,
);
const mockedSendRegistrationOtp = vi.mocked(sendRegistrationOtp);
const mockedVerifyRegistrationOtp = vi.mocked(verifyRegistrationOtp);
const mockedSignOut = vi.fn(() => Promise.resolve());

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-path">{location.pathname}</output>;
}

const renderRegisterPage = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider
          value={{
            session: null,
            signIn: vi.fn(),
            signInWithAccount: vi.fn(),
            signOut: mockedSignOut,
            status: 'anonymous',
          }}
        >
          <ToastProvider>
            <RegisterPage />
            <LocationProbe />
          </ToastProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );

const fillBasicDetails = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('名字'), '王小明');
  await user.type(screen.getByLabelText('暱稱'), '彩彩');
  await user.type(screen.getByLabelText('班級序號'), 'ABCD-1234-EF56-7890');
};

const reachCredentialsStep = async (
  user: ReturnType<typeof userEvent.setup>,
) => {
  await fillBasicDetails(user);
  await user.click(screen.getByRole('button', { name: '下一步' }));
  await user.type(screen.getByLabelText('E-mail'), 'student@example.com');
  await user.click(screen.getByRole('button', { name: '傳送驗證碼' }));
  await user.type(await screen.findByLabelText('E-mail 驗證碼'), '123456');
  await user.click(screen.getByRole('button', { name: '確認驗證' }));
  await waitFor(() => {
    expect(screen.getByText('✓ 已認證')).toBeVisible();
  });
  await user.click(screen.getByRole('button', { name: '下一步' }));
};

describe('RegisterPage', () => {
  beforeEach(() => {
    mockedCompleteStudentRegistration.mockClear();
    mockedSendRegistrationOtp.mockClear();
    mockedVerifyRegistrationOtp.mockClear();
    mockedSignOut.mockClear();
  });

  it('starts on a fixed basic-details step without the removed guild branding', () => {
    renderRegisterPage();

    expect(
      screen.getByRole('heading', { name: '註冊帳號' }),
    ).toBeInTheDocument();
    expect(screen.getByText('基本資料')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByLabelText('名字')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('暱稱')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('班級序號')).toHaveAttribute('type', 'text');
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('帳號（學號）')).not.toBeInTheDocument();
    expect(screen.queryByText('冒險者公會')).not.toBeInTheDocument();
    expect(screen.queryByText('建立你的冒險者通行證')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'ColorPlay 藍金寶典' }),
    ).not.toBeInTheDocument();
  });

  it('does not leave basic details until all three fields are valid', async () => {
    const user = userEvent.setup();
    renderRegisterPage();

    await user.click(screen.getByRole('button', { name: '下一步' }));

    expect(await screen.findByText('請輸入名字')).toBeVisible();
    expect(screen.getByText('基本資料')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
  });

  it('moves from basic details through verified email to credentials', async () => {
    const user = userEvent.setup();
    renderRegisterPage();

    await reachCredentialsStep(user);

    expect(mockedSendRegistrationOtp).toHaveBeenCalledWith(
      'student@example.com',
    );
    expect(mockedVerifyRegistrationOtp).toHaveBeenCalledWith(
      'student@example.com',
      '123456',
    );
    expect(screen.getByText('帳號與密碼')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByLabelText('帳號（學號）')).toHaveAttribute(
      'type',
      'text',
    );
    expect(screen.getByLabelText('密碼')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('密碼確認')).toHaveAttribute(
      'type',
      'password',
    );
    expect(screen.getByRole('button', { name: '完成註冊' })).toBeEnabled();
  });

  it('toggles the two registration passwords independently without clearing either value', async () => {
    const user = userEvent.setup();
    renderRegisterPage();
    await reachCredentialsStep(user);

    const password = screen.getByLabelText('密碼');
    const confirmation = screen.getByLabelText('密碼確認');
    await user.type(password, 'SecretA');
    await user.type(confirmation, 'SecretA');

    expect(password).toHaveAttribute('type', 'password');
    expect(confirmation).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: '顯示密碼' }));

    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('SecretA');
    expect(confirmation).toHaveAttribute('type', 'password');
    expect(confirmation).toHaveValue('SecretA');

    await user.click(
      screen.getByRole('button', { name: '顯示密碼確認' }),
    );

    expect(password).toHaveAttribute('type', 'text');
    expect(confirmation).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: '隱藏密碼' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: '隱藏密碼確認' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('lets the student revisit every reached step without losing entered values', async () => {
    const user = userEvent.setup();
    renderRegisterPage();

    await reachCredentialsStep(user);

    await user.click(screen.getByRole('button', { name: '基本資料' }));
    expect(screen.getByText('基本資料')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByLabelText('暱稱')).toHaveValue('彩彩');

    await user.click(screen.getByRole('button', { name: 'E-mail 驗證' }));
    expect(screen.getByText('E-mail 驗證')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByLabelText('E-mail')).toHaveValue('student@example.com');
    expect(screen.getByText('✓ 已認證')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '帳號與密碼' }));
    expect(screen.getByText('帳號與密碼')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('returns to the earliest invalid step before moving forward again', async () => {
    const user = userEvent.setup();
    renderRegisterPage();
    await reachCredentialsStep(user);

    await user.click(screen.getByRole('button', { name: '基本資料' }));
    await user.clear(screen.getByLabelText('暱稱'));
    await user.click(screen.getByRole('button', { name: '帳號與密碼' }));

    expect(screen.getByText('基本資料')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(await screen.findByText('暱稱需為 2 至 16 個字')).toBeVisible();
  });

  it('lets the student change and reverify the email after reaching step three', async () => {
    const user = userEvent.setup();
    renderRegisterPage();
    await reachCredentialsStep(user);

    await user.click(screen.getByRole('button', { name: 'E-mail 驗證' }));
    await user.click(screen.getByRole('button', { name: '更改 E-mail' }));

    expect(screen.getByLabelText('E-mail')).toBeEnabled();
    expect(screen.getByRole('button', { name: '帳號與密碼' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '傳送驗證碼' })).toBeEnabled();
  });

  it('keeps the existing registration submit contract on the third step', async () => {
    const user = userEvent.setup();
    renderRegisterPage();
    await reachCredentialsStep(user);

    await user.type(screen.getByLabelText('帳號（學號）'), 'cp045001');
    await user.type(screen.getByLabelText('密碼'), 'SecretA');
    await user.type(screen.getByLabelText('密碼確認'), 'SecretA');
    await user.click(screen.getByRole('button', { name: '完成註冊' }));

    await waitFor(() => {
      expect(mockedCompleteStudentRegistration).toHaveBeenCalledWith({
        account: 'cp045001',
        classCode: 'ABCD-1234-EF56-7890',
        fullName: '王小明',
        nickname: '彩彩',
        password: 'SecretA',
      });
    });
    expect(screen.getByTestId('location-path')).toHaveTextContent('/login');
    expect(mockedSignOut).toHaveBeenCalledOnce();
  });

  it('shows the safe registration stage that failed instead of a generic error', async () => {
    const user = userEvent.setup();
    mockedCompleteStudentRegistration.mockRejectedValueOnce(
      new AccountFlowError('MEMBERSHIP_LOOKUP_FAILED'),
    );
    renderRegisterPage();
    await reachCredentialsStep(user);

    await user.type(screen.getByLabelText('帳號（學號）'), 'cp045002');
    await user.type(screen.getByLabelText('密碼'), 'SecretA');
    await user.type(screen.getByLabelText('密碼確認'), 'SecretA');
    await user.click(screen.getByRole('button', { name: '完成註冊' }));

    expect(
      await screen.findByText('無法確認班級加入狀態，請稍後再試。'),
    ).toBeVisible();
  });

  it('links back to login from every registration step', () => {
    renderRegisterPage();

    expect(screen.getByRole('link', { name: '返回登入' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
