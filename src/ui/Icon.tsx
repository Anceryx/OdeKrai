import {
  ArrowUpRight,
  ArrowsClockwise,
  Camera,
  ChatCircle,
  CheckCircle,
  Clock,
  DownloadSimple,
  DotsThree,
  Eye,
  EyeSlash,
  Folder,
  Gear,
  House,
  Key,
  MagnifyingGlass,
  Notebook,
  PaperPlaneRight,
  PawPrint,
  PencilSimple,
  PlugsConnected,
  Plus,
  Prohibit,
  Pulse,
  Question,
  ShieldCheck,
  Stop,
  Trash,
  User,
  Warning,
  X,
  XCircle,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';

const icons: Record<string, PhosphorIcon> = {
  home: House,
  chat: ChatCircle,
  memory: Notebook,
  connectors: PlugsConnected,
  pet: PawPrint,
  settings: Gear,
  shield: ShieldCheck,
  activity: Pulse,
  profile: User,
  help: Question,
  send: PaperPlaneRight,
  plus: Plus,
  delete: Trash,
  edit: PencilSimple,
  camera: Camera,
  folder: Folder,
  key: Key,
  search: MagnifyingGlass,
  show: Eye,
  hide: EyeSlash,
  refresh: ArrowsClockwise,
  download: DownloadSimple,
  more: DotsThree,
  'external-link': ArrowUpRight,
  success: CheckCircle,
  error: XCircle,
  warning: Warning,
  pending: Clock,
  blocked: Prohibit,
  stop: Stop,
  close: X,
};

export type IconName = keyof typeof icons;

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const Component = icons[name] ?? Question;
  return (
    <Component
      size={size}
      weight="light"
      color="currentColor"
      aria-hidden="true"
      focusable="false"
    />
  );
}
