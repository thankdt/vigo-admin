
"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type ComboboxOption = {
    value: string;
    label: string;
}

type ComboboxGroupedOption = {
    label: string;
    options: ComboboxOption[];
}

type ComboboxProps = {
  options: (ComboboxOption | ComboboxGroupedOption)[];
  selectedValue?: string;
  onSelect: (value: string | undefined) => void;
  placeholder: string;
  searchPlaceholder: string;
  noResultsText: string;
  className?: string;
  disabled?: boolean;
};

export function Combobox({
    options,
    selectedValue,
    onSelect,
    placeholder,
    searchPlaceholder,
    noResultsText,
    className,
    disabled = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const findLabel = (value?: string): string | undefined => {
    if (!value) return undefined;
    for (const option of options) {
      if ('options' in option) {
        const found = option.options.find(subOption => subOption.value === value);
        if (found) return found.label;
      } else {
        if (option.value === value) return option.label;
      }
    }
    return undefined;
  };
  
  const currentLabel = findLabel(selectedValue) || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", !selectedValue && "text-muted-foreground", className)}
          disabled={disabled}
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{noResultsText}</CommandEmpty>
            {options.map((option, index) => {
                if ('options' in option) {
                    return (
                        <CommandGroup key={`${option.label}-${index}`} heading={option.label}>
                             {option.options.map(subOption => (
                                <CommandItem
                                    key={subOption.value}
                                    value={subOption.label}
                                    onSelect={() => {
                                        onSelect(subOption.value === selectedValue ? undefined : subOption.value)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            selectedValue === subOption.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {subOption.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )
                }
                return (
                    <CommandItem
                        key={option.value}
                        value={option.label}
                        onSelect={() => {
                            onSelect(option.value === selectedValue ? undefined : option.value)
                            setOpen(false)
                        }}
                    >
                        <Check
                            className={cn(
                                "mr-2 h-4 w-4",
                                selectedValue === option.value ? "opacity-100" : "opacity-0"
                            )}
                        />
                        {option.label}
                    </CommandItem>
                )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
