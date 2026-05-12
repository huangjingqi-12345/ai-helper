import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/Badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Test Badge</Badge>);
    expect(screen.getByText('Test Badge')).toBeInTheDocument();
  });

  it('renders with default gray color', () => {
    const { container } = render(<Badge>Default</Badge>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders with green color', () => {
    render(<Badge color="green">Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders with blue color', () => {
    render(<Badge color="blue">Info</Badge>);
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('renders with yellow color', () => {
    render(<Badge color="yellow">Warning</Badge>);
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('renders with red color', () => {
    render(<Badge color="red">Error</Badge>);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('accepts additional className', () => {
    render(<Badge className="custom-class">Custom</Badge>);
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });
});
