// Shared Recharts config — import from any chart component

export const CHART_COLORS = {
  income:     "#10b981",
  expense:    "#f43f5e",
  net:        "#6366f1",
  cumulative: "#8b5cf6",
  hpp:        "#f97316",
  brand:      "#7c3aed",
  neutral:    "#64748b",
} as const;

// Common axis tick style
export const TICK_STYLE = { fontSize: 11, fill: "rgb(100 116 139)" } as const;

// Common grid style
export const GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: "rgba(148 163 184 / 0.08)",
  vertical: false,
} as const;

// Tooltip container class (styled in globals.css)
export const TOOLTIP_PROPS = {
  contentStyle: {
    background: "transparent",
    border: "none",
    padding: 0,
  },
  wrapperClassName: "chart-tooltip",
  cursor: { fill: "rgba(148 163 184 / 0.06)" },
} as const;

// Legend style
export const LEGEND_PROPS = {
  iconType: "circle" as const,
  iconSize: 7,
  wrapperStyle: { fontSize: 11, color: "rgb(140 149 183)" },
} as const;
