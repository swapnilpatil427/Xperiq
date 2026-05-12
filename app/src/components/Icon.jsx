export function Icon({ name, fill = 0, size = 24, className = '' }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
        fontSize: `${size}px`,
      }}
    >
      {name}
    </span>
  );
}
