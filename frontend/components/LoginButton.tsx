'use client'

import { usePrivy } from '@privy-io/react-auth'

export default function LoginButton() {
  const { login } = usePrivy()

  return (
    <button
      onClick={() => login()}
      style={{
        padding: '14px 20px',
        borderRadius: 10,
        border: 'none',
        background: '#2F3A2E',
        color: '#FFF',
        fontSize: 16,
        fontWeight: 500,
        cursor: 'pointer',
        width: '100%',
        maxWidth: 280,
      }}
    >
      Start
    </button>
  )
}
