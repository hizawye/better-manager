import { ReactNode, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'error' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseClass = 'btn';
  const variantClass = `btn-${variant}`;
  const sizeClass = `btn-${size}`;

  return (
    <button
      className={`${baseClass} ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="loading loading-spinner"></span>}
      {children}
    </button>
  );
}
