import {
  BookOpen,
  ClipboardList,
  Compass,
  Database,
  FilePlus2,
  History,
  Inbox,
  LayoutDashboard,
  Mail,
  Send,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from './portal';

export type NavItem = { label: string; to: string; icon: LucideIcon; end?: boolean; group?: string };

/** Left-nav items per role. Authors/reviewers get a focused set; editors/admins the console. */
export const navForRole = (role: Role): NavItem[] => {
  switch (role) {
    case 'author':
      return [
        { label: 'Dashboard', to: '/admin/author', icon: LayoutDashboard, end: true },
        { label: 'New Submission', to: '/admin/author/submit', icon: FilePlus2 },
      ];
    case 'reviewer':
      return [{ label: 'My Assignments', to: '/admin/reviewer', icon: ClipboardList, end: true }];
    case 'editor':
      // Editorial workflow only — no scraping/ingestion (Discovery/Jobs/Staging/Journals are admin).
      return [
        { label: 'Submissions', to: '/admin/submissions', icon: Inbox, end: true },
        { label: 'Settings', to: '/admin/settings', icon: Settings },
      ];
    case 'admin':
    default:
      // Grouped by workflow: overview → scrape content → publish → account.
      return [
        { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
        { label: 'Discovery', to: '/admin/collection', icon: Compass, group: 'Content' },
        { label: 'Jobs', to: '/admin/jobs', icon: History, group: 'Content' },
        { label: 'Review Queue', to: '/admin/review', icon: ClipboardList, group: 'Content' },
        { label: 'Staging', to: '/admin/staging', icon: Database, group: 'Content' },
        { label: 'Journals', to: '/admin/journals', icon: BookOpen, group: 'Publishing' },
        { label: 'Submissions', to: '/admin/submissions', icon: Inbox, group: 'Publishing' },
        { label: 'Author Leads', to: '/admin/leads', icon: Mail, group: 'Outreach' },
        { label: 'Send Emails', to: '/admin/outreach', icon: Send, group: 'Outreach' },
        { label: 'Users', to: '/admin/users', icon: Users, group: 'Account' },
        { label: 'Settings', to: '/admin/settings', icon: Settings, group: 'Account' },
      ];
  }
};

export const ROLE_LABEL: Record<Role, string> = {
  author: 'Author Portal',
  reviewer: 'Reviewer',
  editor: 'Editorial Office',
  admin: 'Editorial Office',
};
