import type { SVGProps } from 'react'

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  )
}

export const PlayIcon = () => (
  <Icon>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
  </Icon>
)
export const PauseIcon = () => (
  <Icon>
    <path d="M8 5v14M16 5v14" strokeWidth={3} />
  </Icon>
)
export const ResetIcon = () => (
  <Icon>
    <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5" />
  </Icon>
)
export const RotateIcon = () => (
  <Icon>
    <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5" />
  </Icon>
)
export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
)
export const DemoIcon = () => (
  <Icon>
    <path d="M4 5h16v14H4zM8 9h4M8 13h8" />
  </Icon>
)
export const NewIcon = () => (
  <Icon>
    <path d="M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14h6" />
  </Icon>
)
export const WarningIcon = () => (
  <Icon>
    <path d="M12 3 2 21h20zM12 10v5M12 18h.01" />
  </Icon>
)
export const UndoIcon = () => (
  <Icon>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
)
export const RedoIcon = () => (
  <Icon>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icon>
)
export const FlipIcon = () => (
  <Icon>
    <path d="M12 3v18" strokeDasharray="2 3" />
    <path d="M8 7 3 12l5 5V7zM16 7l5 5-5 5V7z" />
  </Icon>
)
export const FileIcon = () => (
  <Icon>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Icon>
)
export const PanelIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M15 4v16" />
  </Icon>
)
export const ChevronDownIcon = () => (
  <Icon width={14} height={14}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)
export const NoteIcon = () => (
  <Icon>
    <path d="M4 5h16M4 10h16M4 15h10" />
  </Icon>
)
export const GearIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
)
/** 程序控制（階梯） */
export const SequenceIcon = () => (
  <Icon>
    <path d="M3 19h5v-5h5V9h5V4h3" />
  </Icon>
)
