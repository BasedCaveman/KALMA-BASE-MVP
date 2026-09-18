'use client'

import dynamic from 'next/dynamic'

const Web3Provider = dynamic(() => import('./Web3Provider'), {
  ssr: false,
})

export default Web3Provider
