import { HTMLAttributes } from "react";

export default function FirecrawlIcon({
  fill = "var(--heat-100)",
  innerFillColor = "var(--background-base)",
  ...attrs
}: HTMLAttributes<HTMLOrSVGElement> & {
  innerFillColor?: string;
  fill?: string;
}) {
  return (
    <svg
      {...attrs}
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 180 180"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="180" height="180" rx="40" fill={fill} />
      <g fill={innerFillColor}>
        <rect x="50" y="46" width="19" height="88" rx="6" />
        <rect x="111" y="46" width="19" height="88" rx="6" />
        <rect x="50" y="80.5" width="80" height="19" rx="5" />
      </g>
    </svg>
  );
}
