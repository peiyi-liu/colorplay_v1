import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '../../../components/ui/toast';
import { RegisterPage } from './register-page';

const renderRegisterPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <RegisterPage />
      </ToastProvider>
    </MemoryRouter>,
  );

describe('RegisterPage', () => {
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
});
