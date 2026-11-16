import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Header } from '@/components/header';
import { SidebarIdentity } from '@/components/sidebar-identity';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CommandDialog, CommandInput, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  STICKY_ACTION_HEAD_CLASS,
  STICKY_ACTION_CELL_CLASS,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { DriversFilterBar, EMPTY_FILTERS } from '@/app/(app)/drivers/components/drivers-filter-bar';
import NotificationsPage from '@/app/(app)/notifications/page';

let mockedPathname = '/bookings';

vi.mock('next/navigation', () => ({
  usePathname: () => mockedPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  getSurvivingProvinces: vi.fn(async () => [
    { id: 1, name: 'Hải Phòng', level: 'PROVINCE', gisCode: '31' },
  ]),
  changeOwnPassword: vi.fn(),
}));

vi.mock('@/app/(app)/notifications/components/notifications-manager', () => ({
  NotificationsManager: () => <div data-testid="notifications-manager">notif-list</div>,
}));

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const m = query.match(/max-width:\s*(\d+)px/);
    const max = m ? Number(m[1]) : 0;
    return {
      matches: width <= max,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  });
}

describe('Mobile / iPad / Tablet responsive admin shell & filters', () => {
  const originalInnerWidth = window.innerWidth;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    mockedPathname = '/bookings';
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
    window.matchMedia = originalMatchMedia;
  });

  it('does not crash when window.matchMedia is undefined (SSR / bare jsdom)', () => {
    // @ts-expect-error simulating bare jsdom without matchMedia
    delete window.matchMedia;
    render(
      <SidebarProvider mobileBreakpoint={1024}>
        <Sidebar collapsible="icon">
          <SidebarContent>Menu</SidebarContent>
        </Sidebar>
        <SidebarInset>
          <Header />
        </SidebarInset>
      </SidebarProvider>,
    );
    expect(screen.getByText('Chuyến đi')).toBeInTheDocument();
  });

  it('treats both phone (390px) and iPad portrait (820px) as drawer mode when mobileBreakpoint=1024, and auto-closes drawer on menu click', async () => {
    const user = userEvent.setup();
    setViewportWidth(820); // iPad Air portrait

    const onSelectItem = vi.fn();
    render(
      <SidebarProvider mobileBreakpoint={1024}>
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onSelectItem}>
                  <span>Quản lý chuyến</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <Header />
        </SidebarInset>
      </SidebarProvider>,
    );

    // Drawer is closed initially on iPad portrait (< 1024px)
    expect(screen.queryByText('Quản lý chuyến')).not.toBeInTheDocument();

    // Tap header trigger -> opens mobile/tablet Sheet drawer
    await user.click(screen.getByRole('button', { name: /Mở hoặc thu gọn menu điều hướng/i }));
    const navBtn = await screen.findByRole('button', { name: 'Quản lý chuyến' });
    expect(navBtn).toBeInTheDocument();

    // Tap menu item -> fires handler AND auto-closes the drawer so it no longer covers the screen
    await user.click(navBtn);
    expect(onSelectItem).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Quản lý chuyến' })).not.toBeInTheDocument();
    });
  });

  it('keeps default mobileBreakpoint=768 desktop-docked at 820px so portals remain backward-compatible', () => {
    setViewportWidth(820);
    const { container } = render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>Portal nav</SidebarContent>
        </Sidebar>
      </SidebarProvider>,
    );
    expect(container.querySelector('[data-state="expanded"]')).not.toBeNull();
  });

  it('allows collapsing and expanding the docked sidebar into icon-rail mode on iPad Landscape (1024px) via Header trigger', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    setViewportWidth(1024);

    const { container } = render(
      <SidebarProvider mobileBreakpoint={1024}>
        <Sidebar collapsible="icon">
          <SidebarContent>Menu</SidebarContent>
          <SidebarFooter>
            <SidebarIdentity fullName="Admin A" phone="0901234567" onLogout={onLogout} />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <Header />
        </SidebarInset>
      </SidebarProvider>,
    );

    const sidebarEl = container.querySelector('[data-side="left"]')!;
    expect(sidebarEl).toHaveAttribute('data-state', 'expanded');

    // Click header trigger on iPad Landscape (1024px) -> collapses to icon rail
    await user.click(screen.getByRole('button', { name: /Mở hoặc thu gọn menu điều hướng/i }));
    expect(sidebarEl).toHaveAttribute('data-state', 'collapsed');
    expect(sidebarEl).toHaveAttribute('data-collapsible', 'icon');

    // Logout button remains uniquely accessible even when collapsed
    await user.click(screen.getByRole('button', { name: /Đăng xuất/ }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('resolves current Vietnamese page titles in sticky Header across routes and detail sub-routes', () => {
    setViewportWidth(390);
    mockedPathname = '/users/detail';
    const { rerender } = render(
      <SidebarProvider mobileBreakpoint={1024}>
        <Header />
      </SidebarProvider>,
    );
    expect(screen.getByText('Chi tiết người dùng')).toBeInTheDocument();

    mockedPathname = '/roles';
    rerender(
      <SidebarProvider mobileBreakpoint={1024}>
        <Header />
      </SidebarProvider>,
    );
    expect(screen.getByText('Phân quyền')).toBeInTheDocument();
  });

  it('renders NotificationsPage on mobile without hiding content behind md:flex', () => {
    setViewportWidth(375);
    render(<NotificationsPage />);
    const manager = screen.getByTestId('notifications-manager');
    expect(manager).toBeInTheDocument();
    expect(manager.parentElement?.className ?? '').not.toContain('hidden');
  });

  it('toggles DriversFilterBar advanced filters on mobile and displays active advanced filter count', async () => {
    const user = userEvent.setup();
    setViewportWidth(390);

    const { rerender } = render(
      <DriversFilterBar value={EMPTY_FILTERS} onChange={() => {}} showOnlineState />,
    );

    const toggleBtn = screen.getByRole('button', { name: /Bộ lọc nâng cao/i });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

    // Rerender with 2 advanced filters active (provinceCode + plate) -> badge shows "2"
    rerender(
      <DriversFilterBar
        value={{ ...EMPTY_FILTERS, provinceCode: '31', plate: '29A' }}
        onChange={() => {}}
        showOnlineState
      />,
    );
    expect(toggleBtn).toHaveTextContent('2');
    expect(screen.getAllByRole('button', { name: /Xóa lọc/i })).toHaveLength(1);

    await user.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('prevents CSS Grid blowout on Card (min-w-0) and enforces 16px touch font rules on Input/Textarea even with text-xs overrides', () => {
    const { container } = render(
      <Card data-testid="grid-card">
        <Input aria-label="Compact input" className="h-8 text-xs" />
        <Textarea aria-label="Compact textarea" className="text-sm" />
      </Card>,
    );
    expect(screen.getByTestId('grid-card').className).toContain('min-w-0');
    const inputCls = screen.getByLabelText('Compact input').className;
    const textareaCls = screen.getByLabelText('Compact textarea').className;
    expect(inputCls).toContain('[@media(pointer:coarse)]:text-base');
    expect(inputCls).toContain('[@media(hover:hover)_and_(pointer:fine)]:md:text-sm');
    expect(textareaCls).toContain('[@media(pointer:coarse)]:text-base');
    expect(container).toBeTruthy();
  });

  it('keeps DialogContent close button sticky on scroll while preserving initial focus on the first form input', async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Form thử nghiệm</DialogTitle>
            <DialogDescription>Mô tả</DialogDescription>
          </DialogHeader>
          <Input aria-label="Ô đầu tiên" />
        </DialogContent>
      </Dialog>,
    );

    const firstInput = await screen.findByLabelText('Ô đầu tiên');
    await waitFor(() => {
      expect(document.activeElement).toBe(firstInput);
    });
    const closeBtn = screen.getByRole('button', { name: /Close/i });
    expect(closeBtn.className).toContain('sticky');
    expect(closeBtn.className).toContain('-order-1');

    const titleEl = screen.getByText('Form thử nghiệm');
    expect(titleEl.className).toContain('[overflow-wrap:anywhere]');
    expect(titleEl.parentElement?.className).toContain('pr-9');
    expect(titleEl.parentElement?.className).toContain('[@media(pointer:coarse)]:pr-10');
  });

  it('decouples DialogContent close button from gap/padding overrides (CommandDialog p-0, gap-0, empty children)', () => {
    const { unmount } = render(
      <CommandDialog open>
        <DialogTitle className="sr-only">Tìm lệnh</DialogTitle>
        <DialogDescription className="sr-only">Gõ từ khoá</DialogDescription>
        <CommandInput placeholder="Tìm nhanh..." />
        <CommandList data-testid="cmd-list" />
      </CommandDialog>,
    );

    const closeBtn = screen.getByRole('button', { name: /Close/i });
    // Must not use negative margin or outward translate that clips under overflow-hidden p-0
    expect(closeBtn.className).not.toContain('-mb-12');
    expect(closeBtn.className).not.toContain('translate-x-1');
    expect(closeBtn.className).not.toContain('-translate-y-1');
    expect(closeBtn.className).toContain('col-start-1');
    expect(closeBtn.className).toContain('row-start-1');
    expect(closeBtn).toHaveAttribute('data-dialog-close', '');

    const cmdList = screen.getByTestId('cmd-list');
    expect(cmdList.className).toContain('--radix-popover-content-available-height');
    expect(cmdList.className).toContain('100dvh');
    unmount();

    // Empty/falsy children (e.g. lightbox while closing) + gap-0 p-2 override
    render(
      <Dialog open>
        <DialogContent className="gap-0 p-2" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Lightbox</DialogTitle>
          {false}
        </DialogContent>
      </Dialog>,
    );
    const bodyWrap = document.querySelector('[data-dialog-body]');
    expect(bodyWrap?.className).toContain('[row-gap:inherit]');
    expect(bodyWrap?.className).toContain('[column-gap:inherit]');
  });

  it('preserves right/center sortable TableHead button alignment, protects role=checkbox from button rules, and provides group/row for sticky action columns', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow data-testid="hdr-row">
            <TableHead data-testid="th-checkbox">
              <Checkbox aria-label="Chọn tất cả" />
            </TableHead>
            <TableHead data-testid="th-left">
              <button type="button">Trái</button>
            </TableHead>
            <TableHead data-testid="th-center" className="text-center">
              <button type="button">Giữa</button>
            </TableHead>
            <TableHead data-testid="th-right" className="text-right">
              <button type="button" className="ml-auto">Phải</button>
            </TableHead>
            <TableHead data-testid="th-sticky" className={STICKY_ACTION_HEAD_CLASS}>
              Thao tác
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-testid="body-row">
            <TableCell>
              <Checkbox aria-label="Chọn dòng 1" />
            </TableCell>
            <TableCell>A</TableCell>
            <TableCell>B</TableCell>
            <TableCell>C</TableCell>
            <TableCell data-testid="td-sticky" className={STICKY_ACTION_CELL_CLASS}>
              <Button variant="ghost" size="icon" className="h-8 w-8 p-0" aria-label="Mở menu">
                …
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const thRightCls = screen.getByTestId('th-right').className;
    expect(thRightCls).toContain("[&:not(.text-center):not(.text-right)>button:not([role=checkbox]):not([role=switch]):not([class*='ml-'])]:-ml-2");
    expect(thRightCls).toContain('[&.text-center>button:not([role=checkbox]):not([role=switch])]:-mx-2');
    expect(thRightCls).toContain('[&.text-right>button:not([role=checkbox]):not([role=switch])]:-mr-2');
    expect(thRightCls).toContain('[&>button:not([role=checkbox]):not([role=switch])]:h-8');

    const hdrCheckbox = screen.getByRole('checkbox', { name: 'Chọn tất cả' });
    expect(hdrCheckbox.className).toContain('[@media(pointer:coarse)]:after:-inset-2');

    expect(screen.getByTestId('hdr-row').className).toContain('group/row');
    expect(screen.getByTestId('body-row').className).toContain('group/row');
    expect(screen.getByTestId('th-sticky').className).toContain('sticky right-0');
    expect(screen.getByTestId('td-sticky').className).toContain('group-hover/row:');

    const menuTriggerCls = screen.getByRole('button', { name: 'Mở menu' }).className;
    expect(menuTriggerCls).toContain('[@media(pointer:coarse)]:min-h-9');
    expect(menuTriggerCls).toContain('[@media(pointer:coarse)]:min-w-9');
  });

  it('bounds PopoverContent to available viewport height and keeps link buttons free of forced min-h-9', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Mở popover</Button>
          </PopoverTrigger>
          <PopoverContent data-testid="pop-content">Nội dung popover</PopoverContent>
        </Popover>
        <Button variant="link" className="h-auto p-0">
          Liên kết nội dòng
        </Button>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Mở popover' }));
    const pop = await screen.findByTestId('pop-content');
    expect(pop.className).toContain('--radix-popover-content-available-height');
    expect(pop.className).toContain('overscroll-contain');

    const linkBtn = screen.getByRole('button', { name: 'Liên kết nội dòng' });
    expect(linkBtn.className).not.toContain('[@media(pointer:coarse)]:min-h-9');
  });
});
