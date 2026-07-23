import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable } from './data-table';

describe('DataTable', () => {
  it('renders caption, headers and rows', () => {
    render(
      <DataTable
        caption="班級個案精熟狀態監控"
        columns={[
          { key: 'name', header: '學生姓名' },
          { key: 'progress', header: '精熟進度' },
        ]}
        rows={[
          { name: '王小明', progress: '3 / 5' },
          { name: '林小華', progress: '5 / 5' },
        ]}
      />,
    );
    expect(
      screen.getByRole('table', { name: '班級個案精熟狀態監控' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: '學生姓名' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '王小明' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '5 / 5' })).toBeInTheDocument();
  });
});
