import * as React from "react"

import { cn } from "@/lib/utils"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

/**
 * Sticky right-edge action column classes synced with TableRow's `group/row`
 * hover (`bg-muted/50` composited opaquely over `bg-card` so scrolled text
 * never bleeds through) and `data-[state=selected]:bg-muted`.
 */
const STICKY_ACTION_HEAD_CLASS =
  "sticky right-0 z-10 bg-card shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.08)] group-hover/row:bg-[color-mix(in_srgb,hsl(var(--muted))_50%,hsl(var(--card)))]"

const STICKY_ACTION_CELL_CLASS =
  "sticky right-0 z-10 bg-card shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.08)] group-hover/row:bg-[color-mix(in_srgb,hsl(var(--muted))_50%,hsl(var(--card)))] group-data-[state=selected]/row:bg-muted"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "group/row border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2.5 text-left align-middle font-medium whitespace-nowrap text-muted-foreground sm:h-11 sm:px-3 lg:px-4 [&:has([role=checkbox])]:pr-0 [&>button:not([role=checkbox]):not([role=switch])]:h-8 [&>button:not([role=checkbox]):not([role=switch])]:px-2 [@media(pointer:coarse)]:[&>button:not([role=checkbox]):not([role=switch])]:min-h-9 [&:not(.text-center):not(.text-right)>button:not([role=checkbox]):not([role=switch]):not([class*='ml-'])]:-ml-2 [&.text-center>button:not([role=checkbox]):not([role=switch])]:-mx-2 [&.text-right>button:not([role=checkbox]):not([role=switch])]:-mr-2",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("px-2.5 py-2.5 align-middle sm:px-3 sm:py-3 lg:p-4 [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  STICKY_ACTION_HEAD_CLASS,
  STICKY_ACTION_CELL_CLASS,
}
