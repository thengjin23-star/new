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
