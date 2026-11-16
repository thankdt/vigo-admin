"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DIALOG_MOD_PREFIX = "(?:(?:!|(?:(?:max-)?(?:sm|md|lg|xl|2xl)|min-\\[[^\\]]+\\]|max-\\[[^\\]]+\\]):)*)!?"
const DIALOG_INNER_SPACING_RE = new RegExp(`^${DIALOG_MOD_PREFIX}(?:p[xytrbl]?-\\S+|gap-\\S+|space-[xy]-\\S+)$`)
const DIALOG_STRIP_OUTER_RE = new RegExp(`^${DIALOG_MOD_PREFIX}(?:p[xytrbl]?-\\S+|gap-\\S+|space-[xy]-\\S+|overflow-[xy]?-\\S+)$`)

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onPointerDownOutside, onInteractOutside, ...props }, ref) => {
  const tokens = (className ?? "").split(/\s+/).filter(Boolean)
  const innerSpacing = tokens.filter((t) => DIALOG_INNER_SPACING_RE.test(t)).join(" ")
  const outerClasses = tokens.filter((t) => !DIALOG_STRIP_OUTER_RE.test(t)).join(" ")

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        onPointerDownOutside={(event) => {
          // Radix portals all popper content (Popover/Combobox/Select dropdowns)
          // outside the dialog DOM. Without this guard, clicking such a dropdown
          // counts as "pointer down outside" → Dialog tries to close / steal
          // focus → CommandInput dies and body.pointer-events sometimes leaks.
          const target = event.target as HTMLElement | null;
          if (target?.closest('[data-radix-popper-content-wrapper]')) {
            event.preventDefault();
            return;
          }
          onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('[data-radix-popper-content-wrapper]')) {
            event.preventDefault();
            return;
          }
          onInteractOutside?.(event);
        }}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 flex w-[calc(100vw-1.5rem)] max-w-lg max-h-[calc(100dvh-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-lg border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          outerClasses
        )}
        {...props}
      >
        <div
          data-dialog-scroll=""
          className={cn(
            "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto overscroll-contain p-4 sm:p-6 [&.p-0>[data-dialog-close]]:top-2 [&.p-0>[data-dialog-close]]:mt-2 [&.p-0>[data-dialog-close]]:mr-2 [&.px-0>[data-dialog-close]]:mr-2 [&.py-0>[data-dialog-close]]:top-2 [&.py-0>[data-dialog-close]]:mt-2",
            innerSpacing
          )}
        >
          <div
            data-dialog-body=""
            className="col-start-1 row-start-1 flex min-w-0 flex-col [column-gap:inherit] [row-gap:inherit] [&>*]:min-w-0"
          >
            {children}
          </div>
          <DialogPrimitive.Close
            data-dialog-close=""
            className="sticky top-0 -order-1 col-start-1 row-start-1 z-20 ml-auto flex h-8 w-8 shrink-0 self-start items-center justify-center rounded-sm bg-background/85 opacity-70 ring-offset-background backdrop-blur-sm transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 pr-9 text-left [@media(pointer:coarse)]:pr-10",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight [overflow-wrap:anywhere]",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground [overflow-wrap:anywhere]", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
