'use client'

import { C, fonts, neu, R } from '@/components/design/palette'

// Placeholder for future-dated market creation.
// When contract upgrade lands (adding startTimestamp param), the
// "Schedule" option activates and reveals a date picker.

export function ObservationWindowSelector({ durationLabel }: { durationLabel: string }) {
  return (
    <div>
      <div style={{
        fontFamily: fonts.mono, fontSize: 10, fontWeight: 700,
        color: C.textMutedStrong, letterSpacing: 1.4, textTransform: 'uppercase',
        marginBottom: 10,
      }}>
        Observation window
      </div>

      <div style={{
        display: 'flex', gap: 8, marginBottom: 12,
      }}>
        {/* Active: starts now */}
        <button style={{
          flex: 1,
          ...neu.controlPressed,
          borderRadius: R.lg,
          padding: '14px 14px',
          border: `1.5px solid ${C.accent}40`,
          cursor: 'default',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        }}>
          <span style={{
            fontFamily: fonts.sans, fontSize: 14, fontWeight: 700, color: C.text,
          }}>
            Starts now
          </span>
          <span style={{
            fontFamily: fonts.mono, fontSize: 11, color: C.textMuted,
          }}>
            Weather measured immediately
          </span>
        </button>

        {/* Disabled: schedule for later */}
        <button
          disabled
          style={{
            flex: 1,
            ...neu.subtle,
            borderRadius: R.lg,
            padding: '14px 14px',
            border: '1.5px solid transparent',
            cursor: 'not-allowed',
            opacity: 0.45,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          }}
        >
          <span style={{
            fontFamily: fonts.sans, fontSize: 14, fontWeight: 700, color: C.textMuted,
          }}>
            Schedule
          </span>
          <span style={{
            fontFamily: fonts.mono, fontSize: 11, color: C.textMuted,
          }}>
            Coming soon
          </span>
        </button>
      </div>

      {/* Timeline preview */}
      <div style={{
        ...neu.controlPressed,
        borderRadius: R.md,
        padding: '12px 14px',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontFamily: fonts.mono, fontSize: 9, color: C.textMuted,
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2,
            }}>
              Predictions close + weather measured
            </div>
            <span style={{
              fontFamily: fonts.sans, fontSize: 15, fontWeight: 600, color: C.text,
            }}>
              Now → {durationLabel}
            </span>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: R.pill,
            background: `${C.above}14`,
          }}>
            <span style={{
              fontFamily: fonts.mono, fontSize: 10, fontWeight: 700,
              color: C.above, letterSpacing: 0.8, textTransform: 'uppercase',
            }}>
              Live
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
