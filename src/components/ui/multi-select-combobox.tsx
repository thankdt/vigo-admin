'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

type ComboboxOption = {
  value: string;
  label: string;
};

type ComboboxGroupedOption = {
  label: string;
  options: ComboboxOption[];
};

type MultiSelectComboBoxProps = {
  options: (ComboboxOption | ComboboxGroupedOption)[];
  selectedValues: string[];
  onSelectedValuesChange: (values: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  noResultsText: string;
  className?: string;
  disabled?: boolean;
};

export function MultiSelectComboBox({
  options,
  selectedValues,
  onSelectedValuesChange,
  placeholder,
  searchPlaceholder,
  noResultsText,
  className,
  disabled = false,
}: MultiSelectComboBoxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');

  const handleSelect = (value: string) => {
    const newSelectedValues = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value];
    onSelectedValuesChange(newSelectedValues);
  };

  const allOptions = React.useMemo(() => {
    const flatOptions: ComboboxOption[] = [];
    options.forEach((option) => {
      if ('options' in option) {
        flatOptions.push(...option.options);
      } else {
        flatOptions.push(option);
      }
    });
    return flatOptions;
  }, [options]);

  const selectedLabels = selectedValues
    .map((value) => allOptions.find((opt) => opt.value === value)?.label)
    .filter(Boolean) as string[];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={cn("relative", className)}>
            <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between h-auto min-h-10"
                disabled={disabled}
            >
                <div className="flex flex-wrap gap-1">
                    {selectedLabels.length > 0 ? (
                        selectedLabels.map((label) => (
                        <Badge
                            key={label}
                            variant="secondary"
                            className="mr-1"
                        >
                            {label}
                        </Badge>
                        ))
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" style={{ zIndex: 9999 }}>
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            <CommandEmpty>{noResultsText}</CommandEmpty>
            {options.map((option, index) => {
              if ('options' in option) {
                return (
                  <CommandGroup
                    key={`${option.label}-${index}`}
                    heading={option.label}
                  >
                    {option.options.map((subOption) => (
                      <CommandItem
                        key={subOption.value}
                        value={subOption.label}
                        onSelect={() => handleSelect(subOption.value)}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedValues.includes(subOption.value)
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        {subOption.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              }
              return (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => handleSelect(option.value)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedValues.includes(option.value)
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                  {option.label}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}