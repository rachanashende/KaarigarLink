import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { FoundationPage as App } from './FoundationPage';

it('renders only the foundation and Member 3 handoff', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('manufacturing job-work');
  expect(screen.getByRole('heading', { name: 'Workshop frontend reserved' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
});
