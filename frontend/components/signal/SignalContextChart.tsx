// kalma/frontend/components/signal/SignalContextChart.tsx
//
// Compact horizontal band chart for a signal's historical context.
// Renders ENTIRELY in SVG (no canvas, no client-only chart libs) so
// it ships in the SSR'd HTML body and is visible to AI crawlers as a
// piece of structured visual evidence — they can extract the labels
// and the marker position from the markup directly.
//
// Layout (left → right along the axis):
//
//   minScale ─────[ ░░░░░░░ ▍ ░░░░░░░ ]─────●───────────── maxScale
//                  rangeStart  median  rangeEnd  forecast
//
//   ┌── Usual 48h range here ─┐               Forecast
//                              ●  23.6mm
//   │ ░░░░░░░░░░░░░░░░░░░░░░ │
//   ──────────────|─────────────────●─────────────
//      8mm typical             23.6mm
//
// The forecast marker is tinted with the severity tone so it visually
// echoes the pill on the same card. When the marker falls inside the
// usual range, the chart reads as "this is normal." When it sits past
// the band, the visual "leak" becomes the proof of the prose.

'use client';

import type {
  BandChartData,
  RunStripChartData,
  SignalChartData,
} from '@/lib/signal-engine/chart-data';

type Props = {
  /** Either a band chart (percentile signals) or a run-strip (event signals). */
  data: BandChartData | RunStripChartData;
  /** Tone color for the forecast marker — should match the severity pill. */
  markerColor: string;
  /** Optional muted color for the band fill. Defaults to a neutral grey. */
  bandColor?: string;
  /** Width hint. The chart scales the SVG via viewBox so this is mostly aesthetic. */
  width?: number;
  height?: number;
};

const W = 320;
const H = 72;

// Layout constants, all in viewBox units. Track is the horizontal line
// the band + median + marker sit on. The labels live above and below.
const TRACK_Y = 38;
const TRACK_LEFT = 12;
const TRACK_RIGHT = W - 12;
const TRACK_W = TRACK_RIGHT - TRACK_LEFT;
const BAND_HEIGHT = 12;

function formatValue(v: number, unit: string): string {
  // 0–10 range: one decimal. 10+: round. Negative temperatures keep decimal.
  if (unit === '°C') {
    return `${Math.round(v * 10) / 10}${unit}`;
  }
  if (Math.abs(v) < 10) return `${Math.round(v * 10) / 10}${unit}`;
  return `${Math.round(v)}${unit}`;
}

export default function SignalContextChart({
  data,
  markerColor,
  bandColor = 'color-mix(in srgb, var(--k-text) 18%, transparent)',
  width = W,
  height = H,
}: Props) {
  if (data.shape === 'run-strip') {
    return (
      <RunStripChart
        data={data}
        markerColor={markerColor}
        width={width}
        height={height}
      />
    );
  }

  const { rangeStart, rangeEnd, median, forecast, minScale, maxScale, unit } =
    data;

  // Map a value on the data axis to an x-coordinate on the track.
  const scale = (v: number): number => {
    if (maxScale === minScale) return TRACK_LEFT;
    const t = (v - minScale) / (maxScale - minScale);
    return TRACK_LEFT + Math.max(0, Math.min(1, t)) * TRACK_W;
  };

  const xRangeStart = scale(rangeStart);
  const xRangeEnd = scale(rangeEnd);
  const xMedian = scale(median);
  const xForecast = scale(forecast);
  const bandY = TRACK_Y - BAND_HEIGHT / 2;

  // When the forecast marker would overlap the labels, nudge them.
  // Forecast label always sits to the right of the marker; if there's
  // less than ~80 viewBox units of room, anchor it left of the marker.
  const forecastLabelOnRight = xForecast < TRACK_RIGHT - 80;

  return (
    <div
      aria-label={`Context chart: ${data.bandLabel} from ${formatValue(
        rangeStart,
        unit,
      )} to ${formatValue(rangeEnd, unit)}, median ${formatValue(
        median,
        unit,
      )}, ${data.forecastLabel.toLowerCase()} at ${formatValue(forecast, unit)}.`}
      style={{
        width: '100%',
        maxWidth: width,
        margin: '6px 0 2px',
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        focusable="false"
      >
        {/* Band label — top left, mono case for credibility */}
        <text
          x={TRACK_LEFT}
          y={14}
          fontFamily="var(--font-mono), 'JetBrains Mono', monospace"
          fontSize="9"
          letterSpacing="0.8"
          fill="currentColor"
          opacity="0.55"
        >
          {data.bandLabel.toUpperCase()}
        </text>

        {/* Forecast label — top right (or left of marker if no room) */}
        <text
          x={forecastLabelOnRight ? TRACK_RIGHT : xForecast - 6}
          y={14}
          textAnchor={forecastLabelOnRight ? 'end' : 'end'}
          fontFamily="var(--font-mono), 'JetBrains Mono', monospace"
          fontSize="9"
          letterSpacing="0.8"
          fill={markerColor}
          opacity="0.95"
        >
          {data.forecastLabel.toUpperCase()}
        </text>

        {/* Track baseline — full width, thin, muted */}
        <line
          x1={TRACK_LEFT}
          y1={TRACK_Y}
          x2={TRACK_RIGHT}
          y2={TRACK_Y}
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="1"
        />

        {/* Usual range band */}
        <rect
          x={xRangeStart}
          y={bandY}
          width={Math.max(2, xRangeEnd - xRangeStart)}
          height={BAND_HEIGHT}
          rx={BAND_HEIGHT / 2}
          fill={bandColor}
          opacity="0.9"
        />

        {/* Median tick — small notch inside the band */}
        <line
          x1={xMedian}
          y1={bandY - 3}
          x2={xMedian}
          y2={bandY + BAND_HEIGHT + 3}
          stroke="currentColor"
          strokeOpacity="0.5"
          strokeWidth="1.5"
        />

        {/* Forecast marker — circle, severity-tinted */}
        <circle
          cx={xForecast}
          cy={TRACK_Y}
          r={6}
          fill={markerColor}
          stroke="var(--k-bg, #0D1710)"
          strokeWidth="2"
        />

        {/* Median value label — below the median tick */}
        <text
          x={xMedian}
          y={H - 8}
          textAnchor="middle"
          fontFamily="var(--font-mono), 'JetBrains Mono', monospace"
          fontSize="10"
          fill="currentColor"
          opacity="0.7"
        >
          {formatValue(median, unit)}
        </text>

        {/* Forecast value label — anchored to whichever side has room */}
        <text
          x={
            forecastLabelOnRight
              ? Math.min(xForecast + 10, TRACK_RIGHT)
              : Math.max(xForecast - 10, TRACK_LEFT)
          }
          y={H - 8}
          textAnchor={forecastLabelOnRight ? 'start' : 'end'}
          fontFamily="var(--font-mono), 'JetBrains Mono', monospace"
          fontSize="11"
          fontWeight="700"
          fill={markerColor}
        >
          {formatValue(forecast, unit)}
        </text>
      </svg>
    </div>
  );
}

// ── Run-strip variant ──────────────────────────────────────────────────────
//
// Layout: a horizontal row of cells, one per forecast day. The
// contiguous `runLength` cells starting at `runStartIndex` are filled
// in the severity tone. Cells outside the run are muted.
//
//   COLD STRETCH (7 DAYS)                          STARTS ~MAY 20
//   ┌─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┐
//   │░│░│░│░│░│█│█│█│█│█│█│█│░│░│
//   └─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┘
//   ← today                  +14d →
//   Below 15°C — usual run here is much shorter

function RunStripChart({
  data,
  markerColor,
  width = W,
  height = H,
}: {
  data: RunStripChartData;
  markerColor: string;
  width?: number;
  height?: number;
}) {
  const { horizonDays, runStartIndex, runLength, topLabel, topRightLabel, noteLabel } =
    data;

  const STRIP_TOP = 26;
  const STRIP_HEIGHT = 18;
  const STRIP_LEFT = 12;
  const STRIP_RIGHT = W - 12;
  const stripWidth = STRIP_RIGHT - STRIP_LEFT;
  const cellGap = 2;
  const totalGap = cellGap * Math.max(0, horizonDays - 1);
  const cellWidth = Math.max(2, (stripWidth - totalGap) / horizonDays);

  return (
    <div
      aria-label={`Run-strip chart: ${topLabel}. ${noteLabel}.`}
      style={{ width: '100%', maxWidth: width, margin: '6px 0 2px' }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        focusable="false"
      >
        {/* Top-left label — the run summary, uppercase mono */}
        <text
          x={STRIP_LEFT}
          y={14}
          fontFamily="var(--font-mono), 'JetBrains Mono', monospace"
          fontSize="9"
          letterSpacing="0.8"
          fill="currentColor"
          opacity="0.55"
        >
          {topLabel.toUpperCase()}
        </text>

        {/* Top-right label — when the run starts */}
        {topRightLabel ? (
          <text
            x={STRIP_RIGHT}
            y={14}
            textAnchor="end"
            fontFamily="var(--font-mono), 'JetBrains Mono', monospace"
            fontSize="9"
            letterSpacing="0.8"
            fill={markerColor}
            opacity="0.95"
          >
            {topRightLabel.toUpperCase()}
          </text>
        ) : null}

        {/* Cell strip — one rect per forecast day */}
        {Array.from({ length: horizonDays }).map((_, i) => {
          const inRun = i >= runStartIndex && i < runStartIndex + runLength;
          const x = STRIP_LEFT + i * (cellWidth + cellGap);
          return (
            <rect
              key={i}
              x={x}
              y={STRIP_TOP}
              width={cellWidth}
              height={STRIP_HEIGHT}
              rx={2}
              fill={inRun ? markerColor : 'currentColor'}
              opacity={inRun ? 0.95 : 0.12}
            />
          );
        })}

        {/* Bottom-left bracket — "today" */}
        <text
          x={STRIP_LEFT}
          y={H - 6}
          fontFamily="var(--font-mono), 'JetBrains Mono', monospace"
          fontSize="9"
          letterSpacing="0.6"
          fill="currentColor"
          opacity="0.5"
        >
          ← TODAY
        </text>

        {/* Bottom-right bracket — horizon end */}
        <text
          x={STRIP_RIGHT}
          y={H - 6}
          textAnchor="end"
          fontFamily="var(--font-mono), 'JetBrains Mono', monospace"
          fontSize="9"
          letterSpacing="0.6"
          fill="currentColor"
          opacity="0.5"
        >
          +{horizonDays}D →
        </text>
      </svg>

      {/* Note line — outside the SVG so it wraps naturally on narrow viewports */}
      {noteLabel ? (
        <div
          style={{
            marginTop: 4,
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            fontSize: 10,
            opacity: 0.6,
            lineHeight: 1.3,
          }}
        >
          {noteLabel}
        </div>
      ) : null}
    </div>
  );
}
