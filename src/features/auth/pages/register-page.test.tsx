import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../../components/ui/toast';
import {
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

const renderRegisterPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <RegisterPage />
      </ToastProvider>
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
  });

  it('links back to login from every registration step', () => {
    renderRegisterPage();

    expect(screen.getByRole('link', { name: '返回登入' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
