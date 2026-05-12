import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '@/components/ui/Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card Content</Card>);
    expect(screen.getByText('Card Content')).toBeInTheDocument();
  });

  it('accepts additional className', () => {
    const { container } = render(<Card className="custom">Content</Card>);
    expect(container.firstChild).toHaveClass('custom');
  });
});
