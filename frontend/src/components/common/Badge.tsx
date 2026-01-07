interface BadgeProps {
  variant?: 'primary' | 'secondary' | 'success' | 'error' | 'warning';
  children: React.ReactNode;
  className?: string;
}

export default function Badge({
  variant = 'primary',
  children,
  className = '',
}: BadgeProps) {
  return (
    <span className={`badge badge-${variant} ${className}`}>{children}</span>
  );
}
