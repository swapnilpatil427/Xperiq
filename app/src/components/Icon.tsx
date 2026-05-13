import React from 'react';

export interface IconProps {
  name: string;
  size?: number;
  fill?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, fill = 0, size = 20, className = '', style }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
        fontSize: `${size}px`,
        ...style,
      }}
    >
      {name}
    </span>
  );
}
