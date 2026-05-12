import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Table } from '@/components/ui/Table';

interface TestRow {
  id: string;
  name: string;
  value: number;
  [key: string]: unknown;
}

const mockData: TestRow[] = [
  { id: '1', name: 'Item 1', value: 100 },
  { id: '2', name: 'Item 2', value: 200 },
  { id: '3', name: 'Item 3', value: 300 },
];

const mockColumns = [
  { key: 'name', header: '名称' },
  { key: 'value', header: '数值' },
];

describe('Table', () => {
  it('renders column headers', () => {
    render(<Table columns={mockColumns} data={mockData} rowKey="id" />);
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('数值')).toBeInTheDocument();
  });

  it('renders data rows', () => {
    render(<Table columns={mockColumns} data={mockData} rowKey="id" />);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
  });

  it('renders with custom render function', () => {
    const columns = [
      {
        key: 'name',
        header: '名称',
        render: (record: TestRow) => <strong>{record.name.toUpperCase()}</strong>,
      },
    ];
    render(<Table columns={columns} data={mockData} rowKey="id" />);
    expect(screen.getByText('ITEM 1')).toBeInTheDocument();
  });

  it('handles row click', () => {
    const handleRowClick = vi.fn();
    render(<Table columns={mockColumns} data={mockData} rowKey="id" onRowClick={handleRowClick} />);
    fireEvent.click(screen.getByText('Item 1'));
    expect(handleRowClick).toHaveBeenCalledWith(mockData[0]);
  });

  it('renders empty table when no data', () => {
    const { container } = render(<Table columns={mockColumns} data={[]} rowKey="id" />);
    const tbody = container.querySelector('tbody');
    expect(tbody?.children).toHaveLength(0);
  });

  it('uses function rowKey', () => {
    render(<Table columns={mockColumns} data={mockData} rowKey={(r) => r.id} />);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });
});
