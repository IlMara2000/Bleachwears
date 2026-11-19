import type { SVGProps } from "react";

/**
 * One house icon set, drawn on the same 24px grid with one stroke weight, so a
 * basket, a hanger and an arrow all read as the same hand. No icon font and no
 * library: a glyph that ships as text changes shape with the system font, which
 * is exactly what a print studio cannot afford.
 */
export type IconName =
  | "arrowRight"
  | "arrowLeft"
  | "home"
  | "grid"
  | "plus"
  | "check"
  | "close"
  | "sparkle"
  | "tee"
  | "hoodie";

const PATHS: Record<IconName, string> = {
  arrowRight: "M4.6 12h13.2M12.4 6.2 18.6 12l-6.2 5.8",
  arrowLeft: "M19.4 12H6.2M11.6 6.2 5.4 12l6.2 5.8",
  home: "M3.9 10.5 12 4l8.1 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4.1v-6H9.5v6H5.4A1.5 1.5 0 0 1 3.9 19z",
  grid: "M4.3 4.3h6.1v6.1H4.3zM13.6 4.3h6.1v6.1h-6.1zM4.3 13.6h6.1v6.1H4.3zM13.6 13.6h6.1v6.1h-6.1z",
  plus: "M12 5.3v13.4M5.3 12h13.4",
  check: "M4.9 12.6 9.8 17.4 19.3 6.9",
  close: "M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7",
  sparkle: "M12 3.2l2.1 6.1 6.1 2.1-6.1 2.1L12 19.6l-2.1-6.1L3.8 11.4l6.1-2.1z",
  /* Neckline, sleeves and body of a tee, in one closed outline. */
  tee: "M8.7 3.4a3.3 3.3 0 0 0 6.6 0l4.7 2.5 1.3 4.5-3 1.2v9H5.7v-9l-3-1.2L4 5.9z",
  /* The same body with a hood and a pocket. */
  hoodie:
    "M9 3.4a3 3 0 0 0 6 0l4.9 2.6 1.4 4.6-3 1.2v8.8H5.7v-8.8l-3-1.2L4.1 6zM8.6 4.6a3.4 3.4 0 0 0 6.8 0M9.4 15.2h5.2",
};

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name" | "children"> & {
  name: IconName;
  size?: number;
};

export function Icon({ name, size = 20, strokeWidth = 1.75, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `ui-icon ${className}` : "ui-icon"}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
