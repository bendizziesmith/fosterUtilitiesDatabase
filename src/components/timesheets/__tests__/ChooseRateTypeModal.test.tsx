import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChooseRateTypeModal } from '../ChooseRateTypeModal';

describe('ChooseRateTypeModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when open', () => {
    render(
      <ChooseRateTypeModal
        isOpen={true}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.getByText('Choose Rate Type')).toBeInTheDocument();
    expect(screen.getByText('Ipsom Rates')).toBeInTheDocument();
    expect(screen.getByText('Mollsworth Rates')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ChooseRateTypeModal
        isOpen={false}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.queryByText('Choose Rate Type')).not.toBeInTheDocument();
  });

  it('fires onSelect with ipsom when Ipsom Rates is clicked', () => {
    render(
      <ChooseRateTypeModal
        isOpen={true}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    );

    fireEvent.click(screen.getByText('Ipsom Rates'));
    expect(mockOnSelect).toHaveBeenCalledWith('ipsom');
  });

  it('fires onSelect with mollsworth when Mollsworth Rates is clicked', () => {
    render(
      <ChooseRateTypeModal
        isOpen={true}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    );

    fireEvent.click(screen.getByText('Mollsworth Rates'));
    expect(mockOnSelect).toHaveBeenCalledWith('mollsworth');
  });

  it('fires onClose when close button is clicked', () => {
    render(
      <ChooseRateTypeModal
        isOpen={true}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(mockOnClose).toHaveBeenCalled();
  });
});