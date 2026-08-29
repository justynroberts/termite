// Minimal inline icon set (stroke style, lucide-like)
import type { JSX } from 'react'

interface IconProps {
  size?: number
}

function svg(path: JSX.Element, size = 18): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  )
}

export const IconServer = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <rect x="2" y="3" width="20" height="7" rx="2" />
      <rect x="2" y="14" width="20" height="7" rx="2" />
      <path d="M6 6.5h.01M6 17.5h.01" />
    </>,
    size
  )

export const IconTerminal = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </>,
    size
  )

export const IconKey = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 21 2M15 7l3 3" />
    </>,
    size
  )

export const IconFolder = ({ size }: IconProps): JSX.Element =>
  svg(<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />, size)

export const IconFile = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <polyline points="14 2 14 8 20 8" />
    </>,
    size
  )

export const IconSnippet = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </>,
    size
  )

export const IconForward = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M18 8L22 12L18 16" />
      <path d="M2 12H22" />
      <path d="M6 16L2 12L6 8" />
    </>,
    size
  )

export const IconSettings = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>,
    size
  )

export const IconSparkle = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M12 3l1.9 5.7L19.5 10l-5.6 1.3L12 17l-1.9-5.7L4.5 10l5.6-1.3L12 3z" />
      <path d="M19 15l.7 2.1 2.1.7-2.1.7L19 20.6l-.7-2.1-2.1-.7 2.1-.7L19 15z" />
    </>,
    size
  )

export const IconHistory = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>,
    size
  )

export const IconTermite = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <ellipse cx="12" cy="13" rx="4" ry="5" />
      <circle cx="12" cy="6.5" r="2.5" />
      <path d="M10.5 4.5 8.5 2M13.5 4.5 15.5 2M8 10 4.5 7.5M8 13H3.5M8.5 16.5 5 20M16 10l3.5-2.5M16 13h4.5M15.5 16.5 19 20" />
    </>,
    size
  )

export const IconPlus = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>,
    size
  )

export const IconX = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>,
    size
  )

export const IconEdit = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </>,
    size
  )

export const IconTrash = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>,
    size
  )

export const IconPlay = ({ size }: IconProps): JSX.Element =>
  svg(<polygon points="5 3 19 12 5 21 5 3" />, size)

export const IconStop = ({ size }: IconProps): JSX.Element =>
  svg(<rect x="5" y="5" width="14" height="14" rx="2" />, size)

export const IconRefresh = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </>,
    size
  )

export const IconUpload = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>,
    size
  )

export const IconDownload = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>,
    size
  )

export const IconArrowUp = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </>,
    size
  )

export const IconHome = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>,
    size
  )

export const IconFolderPlus = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      <line x1="12" y1="10" x2="12" y2="16" />
      <line x1="9" y1="13" x2="15" y2="13" />
    </>,
    size
  )

export const IconSend = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </>,
    size
  )

export const IconChevronUp = ({ size }: IconProps): JSX.Element =>
  svg(<polyline points="18 15 12 9 6 15" />, size)

export const IconChevronDown = ({ size }: IconProps): JSX.Element =>
  svg(<polyline points="6 9 12 15 18 9" />, size)

export const IconRunbook = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <polyline points="3 5 4 7 6 4" />
      <polyline points="3 11 4 13 6 10" />
      <polyline points="3 17 4 19 6 16" />
    </>,
    size
  )

export const IconSplitRight = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </>,
    size
  )

export const IconSplitDown = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </>,
    size
  )

export const IconCopy = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
    size
  )

export const IconPaste = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M9 5h6" />
      <path d="M9 3h6a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2V5a2 2 0 0 1 2-2Z" />
      <path d="M8 12h8M8 16h6" />
    </>,
    size
  )

export const IconExternalLink = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M14 3h7v7" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </>,
    size
  )

export const IconDuplicate = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
      <path d="M14.5 12v5M12 14.5h5" />
    </>,
    size
  )

export const IconBroadcast = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" />
    </>,
    size
  )

export const IconSearch = ({ size }: IconProps): JSX.Element =>
  svg(
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="22" y2="22" />
    </>,
    size
  )
