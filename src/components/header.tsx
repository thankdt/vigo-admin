import { SidebarTrigger } from '@/components/ui/sidebar';

// Logout đã gộp về footer sidebar (SidebarIdentity) — UserNav góc phải bị bỏ (spec §5.4).
export function Header() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      <SidebarTrigger className="md:hidden" />
      <div className="flex-1" />
    </header>
  );
}
