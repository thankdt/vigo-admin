"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight, Circle } from "lucide-react"

import { cn } from "@/lib/utils"

type DropdownMenuGuardContextValue = {
  open: boolean
  toggle: () => void
}

const DropdownMenuGuardContext =
  React.createContext<DropdownMenuGuardContextValue | null>(null)

const isNonMousePointer = (pointerType?: string) =>
  pointerType === "touch" || pointerType === "pen"

function preventNonMousePointerUp<E extends React.PointerEvent>(
  userHandler?: (event: E) => void
) {
  return (event: E) => {
    userHandler?.(event)
    if (!event.defaultPrevented && isNonMousePointer(event.pointerType)) {
      event.preventDefault()
    }
  }
}

const DropdownMenu = ({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const isControlled = openProp !== undefined
  const open = isControlled ? Boolean(openProp) : uncontrolledOpen
  const openRef = React.useRef(open)
  openRef.current = open

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen)
      }
      onOpenChange?.(nextOpen)
    },
    [isControlled, onOpenChange]
  )

  const toggle = React.useCallback(() => {
    handleOpenChange(!openRef.current)
  }, [handleOpenChange])

  const guardValue = React.useMemo(
    () => ({ open, toggle }),
    [open, toggle]
  )

  return (
    <DropdownMenuGuardContext.Provider value={guardValue}>
      <DropdownMenuPrimitive.Root
        open={open}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </DropdownMenuGuardContext.Provider>
  )
}

const DropdownMenuTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>
>(
  (
    {
      onPointerDown,
      onPointerMove,
      onPointerCancel,
      onClick,
      onKeyDown,
      onBlur,
      disabled,
      ...props
    },
    ref
  ) => {
    const guard = React.useContext(DropdownMenuGuardContext)
    const pendingTouchClickRef = React.useRef(false)
    const touchStartPosRef = React.useRef<{ x: number; y: number } | null>(null)

    const clearPendingTouch = () => {
      pendingTouchClickRef.current = false
      touchStartPosRef.current = null
    }

    return (
      <DropdownMenuPrimitive.Trigger
        ref={ref}
        disabled={disabled}
        onPointerDown={(event) => {
          onPointerDown?.(event)
          if (event.defaultPrevented || disabled) {
            clearPendingTouch()
            return
          }
          // Radix opens on pointerdown even for touch pointers, which pops the
          // menu mid-swipe when scrolling over "..." buttons on mobile. Defer
          // touch/pen activation to onClick so scroll gestures never open it.
          if (
            isNonMousePointer(event.pointerType) &&
            event.button === 0 &&
            !event.ctrlKey
          ) {
            pendingTouchClickRef.current = !guard?.open
            touchStartPosRef.current = { x: event.clientX, y: event.clientY }
            event.preventDefault()
          } else {
            clearPendingTouch()
          }
        }}
        onPointerMove={(event) => {
          onPointerMove?.(event)
          if (
            pendingTouchClickRef.current &&
            touchStartPosRef.current &&
            isNonMousePointer(event.pointerType)
          ) {
            const dx = event.clientX - touchStartPosRef.current.x
            const dy = event.clientY - touchStartPosRef.current.y
            if (Math.hypot(dx, dy) > 10) {
              clearPendingTouch()
            }
          }
        }}
        onPointerCancel={(event) => {
          clearPendingTouch()
          onPointerCancel?.(event)
        }}
        onKeyDown={(event) => {
          clearPendingTouch()
          onKeyDown?.(event)
        }}
        onBlur={(event) => {
          clearPendingTouch()
          onBlur?.(event)
        }}
        onClick={(event) => {
          onClick?.(event)
          if (event.defaultPrevented || disabled) {
            clearPendingTouch()
            return
          }
          if (pendingTouchClickRef.current) {
            clearPendingTouch()
            guard?.toggle()
          }
        }}
        {...props}
      />
    )
  }
)
DropdownMenuTrigger.displayName = DropdownMenuPrimitive.Trigger.displayName

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuSub = DropdownMenuPrimitive.Sub

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-2 text-sm outline-none md:py-1.5 focus:bg-accent data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      collisionPadding={8}
      className={cn(
        "z-50 min-w-[8rem] max-w-[calc(100vw-1rem)] max-h-[var(--radix-dropdown-menu-content-available-height,24rem)] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={8}
      className={cn(
        "z-50 min-w-[8rem] max-w-[calc(100vw-1rem)] max-h-[var(--radix-dropdown-menu-content-available-height,24rem)] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
  }
>(({ className, inset, onPointerUp, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    onPointerUp={preventNonMousePointerUp(onPointerUp)}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none transition-colors md:py-1.5 focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, onPointerUp, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    onPointerUp={preventNonMousePointerUp(onPointerUp)}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, onPointerUp, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    onPointerUp={preventNonMousePointerUp(onPointerUp)}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-semibold",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  )
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}
