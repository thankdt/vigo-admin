'use client';

import * as React from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { searchAddress, getPlaceDetail } from '@/lib/api';
import type { AutocompleteResult } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface AddressAutocompleteProps {
  value: string;
  placeholder?: string;
  onSelect: (data: { address: string; lat: number; long: number }) => void;
  onClear?: () => void;
  className?: string;
}

export function AddressAutocomplete({
  value,
  placeholder = 'Nhập địa chỉ...',
  onSelect,
  onClear,
  className,
}: AddressAutocompleteProps) {
  const { toast } = useToast();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<AutocompleteResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [isResolving, setIsResolving] = React.useState(false);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [selected, setSelected] = React.useState(!!value);
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  // Sync external value changes
  React.useEffect(() => {
    if (value) {
      setQuery(value);
      setSelected(true);
    } else {
      setQuery('');
      setSelected(false);
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setSelected(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setShowDropdown(true);
    setIsSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchAddress(val.trim());
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  };

  const handleSelect = async (item: AutocompleteResult) => {
    setShowDropdown(false);
    setIsResolving(true);
    setQuery(item.description);

    try {
      const detail = await getPlaceDetail(item.place_id);
      const address = detail.formatted_address || item.description;
      const lat = detail.geometry.location.lat;
      const lng = detail.geometry.location.lng;

      setQuery(address);
      setSelected(true);
      onSelect({ address, lat, long: lng });
    } catch (err) {
      // Surface the failure instead of silently storing 0,0 coords (which would
      // mis-price the trip). Keep the address text but warn the operator to retry.
      console.error('[AddressAutocomplete] getPlaceDetail failed:', err);
      toast({
        variant: 'destructive',
        title: 'Không lấy được toạ độ',
        description: `Không resolve được điểm "${item.description}". Vui lòng chọn lại địa điểm.`,
      });
      setSelected(true);
      onSelect({ address: item.description, lat: 0, long: 0 });
    } finally {
      setIsResolving(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSelected(false);
    setResults([]);
    onClear?.();
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={handleInputChange}
          onFocus={() => { if ((results.length > 0 || query.trim().length >= 2) && !selected) setShowDropdown(true); }}
          placeholder={placeholder}
          className={cn('pl-8 pr-8', selected && 'text-foreground')}
          disabled={isResolving}
        />
        {(isResolving || isSearching) && (
          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {selected && !isResolving && !isSearching && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-[220px] overflow-y-auto">
          {isSearching && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Đang tìm địa điểm...</span>
            </div>
          )}
          {!isSearching && results.length === 0 && query.trim().length >= 2 && (
            <div className="py-3 text-xs text-muted-foreground text-center">
              Không tìm thấy địa điểm phù hợp
            </div>
          )}
          {!isSearching && results.map((item, idx) => (
            <button
              key={item.place_id || idx}
              type="button"
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent active:bg-accent/80 transition-colors border-b last:border-b-0 flex items-start gap-2"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item);
              }}
              onClick={() => handleSelect(item)}
            >
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {item.structured_formatting ? (
                  <>
                    <div className="font-medium truncate">{item.structured_formatting.main_text}</div>
                    <div className="text-xs text-muted-foreground truncate">{item.structured_formatting.secondary_text}</div>
                  </>
                ) : (
                  <div className="truncate">{item.description}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
