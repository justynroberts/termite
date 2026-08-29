import type { JSX } from 'react'
import termiteIcon from '../../../../build/icon.png'

interface Props {
  size?: number
  className?: string
}

export default function TermiteLogo({ size = 20, className = '' }: Props): JSX.Element {
  return <img className={`termite-logo ${className}`} src={termiteIcon} width={size} height={size} alt="" draggable={false} />
}
