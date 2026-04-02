interface ChatBadgeProps {
  count: number;
}

export function ChatBadge({ count }: ChatBadgeProps) {
  if (count <= 0) return null;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 20, height: 20, padding: '0 6px',
      fontSize: 11, fontWeight: 700, color: '#fff',
      background: '#FF4D6A', borderRadius: 10,
      boxShadow: '0 2px 6px rgba(255,77,106,0.4)',
    }}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
