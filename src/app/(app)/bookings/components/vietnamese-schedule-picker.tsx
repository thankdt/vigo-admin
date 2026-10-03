'use client';

import * as React from 'react';
import {
  format,
  addDays,
  isSameDay,
  startOfDay,
  addMonths,
  subMonths,
  getDaysInMonth,
  startOfMonth,
  getDay,
} from 'date-fns';
import { vi } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatLocal } from './schedule-utils';

interface VietnameseSchedulePickerProps {
  scheduledFrom: string; // YYYY-MM-DDTHH:mm
  scheduledTo: string;   // YYYY-MM-DDTHH:mm
  minScheduledAt?: string;
  onChangeFrom: (val: string) => void;
  onChangeTo: (val: string) => void;
  onClearEstimate?: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export function VietnameseSchedulePicker({
  scheduledFrom,
  scheduledTo,
  minScheduledAt,
  onChangeFrom,
  onChangeTo,
  onClearEstimate,
}: VietnameseSchedulePickerProps) {
  const [popoverOpen, setPopoverOpen] = React.useState(false);

  // Parse currently selected date
  const fromDate = React.useMemo(() => {
    if (!scheduledFrom) return new Date();
    const d = new Date(scheduledFrom);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [scheduledFrom]);

  const toDate = React.useMemo(() => {
    if (!scheduledTo) {
      const d = new Date(fromDate);
      d.setMinutes(d.getMinutes() + 30);
      return d;
    }
    const d = new Date(scheduledTo);
    return Number.isNaN(d.getTime()) ? new Date(fromDate.getTime() + 30 * 60000) : d;
  }, [scheduledTo, fromDate]);

  const [monthView, setMonthView] = React.useState<Date>(() => startOfMonth(fromDate));

  // Sync month view if selected date changes to a different month
  React.useEffect(() => {
    setMonthView(startOfMonth(fromDate));
  }, [fromDate]);

  const today = React.useMemo(() => startOfDay(new Date()), []);
  const tomorrow = React.useMemo(() => addDays(today, 1), [today]);
  const dayAfterTomorrow = React.useMemo(() => addDays(today, 2), [today]);

  const isToday = isSameDay(fromDate, today);
  const isTomorrow = isSameDay(fromDate, tomorrow);
  const isDayAfter = isSameDay(fromDate, dayAfterTomorrow);
  const isOtherDay = !isToday && !isTomorrow && !isDayAfter;

  const currentFromHour = String(fromDate.getHours()).padStart(2, '0');
  const currentFromMin = String(Math.floor(fromDate.getMinutes() / 5) * 5).padStart(2, '0');

  const currentToHour = String(toDate.getHours()).padStart(2, '0');
  const currentToMin = String(Math.floor(toDate.getMinutes() / 5) * 5).padStart(2, '0');

  // Apply new date while keeping time
  const handleDateSelect = (targetDate: Date) => {
    const newFrom = new Date(targetDate);
    newFrom.setHours(fromDate.getHours(), fromDate.getMinutes(), 0, 0);

    const diffMs = toDate.getTime() - fromDate.getTime();
    const safeDiff = diffMs > 0 ? diffMs : 30 * 60000;
    const newTo = new Date(newFrom.getTime() + safeDiff);

    onChangeFrom(formatLocal(newFrom));
    onChangeTo(formatLocal(newTo));
    onClearEstimate?.();
    setPopoverOpen(false);
  };

  // Apply from time
  const handleFromTimeChange = (hourStr: string, minStr: string) => {
    const newFrom = new Date(fromDate);
    newFrom.setHours(Number(hourStr), Number(minStr), 0, 0);

    // Keep the same duration window for `to`
    const diffMs = toDate.getTime() - fromDate.getTime();
    const duration = diffMs > 0 ? diffMs : 30 * 60000;
    const newTo = new Date(newFrom.getTime() + duration);

    onChangeFrom(formatLocal(newFrom));
    onChangeTo(formatLocal(newTo));
    onClearEstimate?.();
  };

  // Apply to time
  const handleToTimeChange = (hourStr: string, minStr: string) => {
    const newTo = new Date(fromDate);
    newTo.setHours(Number(hourStr), Number(minStr), 0, 0);
    onChangeTo(formatLocal(newTo));
  };

  // Quick duration bump (+30m, +45m, +1h)
  const handleDurationBump = (minutes: number) => {
    const newTo = new Date(fromDate.getTime() + minutes * 60000);
    onChangeTo(formatLocal(newTo));
  };

  // Calendar rendering helpers
  const daysInCurrentMonth = getDaysInMonth(monthView);
  const startDayOfWeek = (getDay(monthView) + 6) % 7; // Monday = 0, Sunday = 6

  const calendarDays = React.useMemo(() => {
    const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];
    const prevMonth = subMonths(monthView, 1);
    const daysInPrevMonth = getDaysInMonth(prevMonth);

    // Padding before 1st of month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), daysInPrevMonth - i);
      days.push({ date: d, isCurrentMonth: false });
    }

    // Days in current month
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      const d = new Date(monthView.getFullYear(), monthView.getMonth(), i);
      days.push({ date: d, isCurrentMonth: true });
    }

    // Padding after end of month (fill full 6 rows if needed, or complete week)
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      const nextMonth = addMonths(monthView, 1);
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), i);
        days.push({ date: d, isCurrentMonth: false });
      }
    }

    return days;
  }, [monthView, daysInCurrentMonth, startDayOfWeek]);

  // Validation checks
  const isPastTime = fromDate.getTime() < Date.now() - 60000;
  const isInvalidWindow = toDate.getTime() <= fromDate.getTime();

  return (
    <div className="space-y-3 pt-1">
      {/* 1. Chọn ngày đón */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          Ngày đón khách <span className="text-destructive">*</span>
        </label>

        {/* Quick Day Chips */}
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => handleDateSelect(today)}
            className={cn(
              'px-2 py-1.5 text-xs rounded-lg border font-medium transition-all text-center flex flex-col items-center justify-center',
              isToday
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold shadow-2xs'
                : 'border-border/80 hover:bg-muted text-muted-foreground'
            )}
          >
            <span>Hôm nay</span>
            <span className="text-[10px] opacity-75 font-normal">{format(today, 'dd/MM')}</span>
          </button>

          <button
            type="button"
            onClick={() => handleDateSelect(tomorrow)}
            className={cn(
              'px-2 py-1.5 text-xs rounded-lg border font-medium transition-all text-center flex flex-col items-center justify-center',
              isTomorrow
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold shadow-2xs'
                : 'border-border/80 hover:bg-muted text-muted-foreground'
            )}
          >
            <span>Ngày mai</span>
            <span className="text-[10px] opacity-75 font-normal">{format(tomorrow, 'dd/MM')}</span>
          </button>

          <button
            type="button"
            onClick={() => handleDateSelect(dayAfterTomorrow)}
            className={cn(
              'px-2 py-1.5 text-xs rounded-lg border font-medium transition-all text-center flex flex-col items-center justify-center',
              isDayAfter
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold shadow-2xs'
                : 'border-border/80 hover:bg-muted text-muted-foreground'
            )}
          >
            <span>Ngày kia</span>
            <span className="text-[10px] opacity-75 font-normal">{format(dayAfterTomorrow, 'dd/MM')}</span>
          </button>

          {/* Chọn ngày khác qua Popover Lịch tiếng Việt */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'px-2 py-1.5 text-xs rounded-lg border font-medium transition-all text-center flex flex-col items-center justify-center',
                  isOtherDay
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold shadow-2xs'
                    : 'border-border/80 hover:bg-muted text-muted-foreground'
                )}
              >
                <span>{isOtherDay ? format(fromDate, 'dd/MM') : 'Ngày khác'}</span>
                <span className="text-[10px] opacity-75 font-normal flex items-center gap-0.5">
                  <CalendarIcon className="h-2.5 w-2.5" />
                  {isOtherDay ? format(fromDate, 'yyyy') : 'Xem lịch'}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              {/* Header Tháng & Nút Next/Prev */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={subMonths(monthView, 1) < startOfMonth(today)}
                  onClick={() => setMonthView(subMonths(monthView, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Tháng {monthView.getMonth() + 1}, {monthView.getFullYear()}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setMonthView(addMonths(monthView, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Tên thứ trong tuần: T2 - CN */}
              <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground mb-1">
                <div>T2</div>
                <div>T3</div>
                <div>T4</div>
                <div>T5</div>
                <div>T6</div>
                <div>T7</div>
                <div className="text-rose-500">CN</div>
              </div>

              {/* Lưới các ngày trong tháng */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {calendarDays.map(({ date, isCurrentMonth }, idx) => {
                  const dayNum = date.getDate();
                  const isDayPast = date < today;
                  const isDaySelected = isSameDay(date, fromDate);
                  const isDayToday = isSameDay(date, today);

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isDayPast || !isCurrentMonth}
                      onClick={() => handleDateSelect(date)}
                      className={cn(
                        'h-8 w-8 rounded-lg flex items-center justify-center text-xs font-medium transition-all mx-auto',
                        !isCurrentMonth && 'invisible',
                        isDayPast && 'opacity-25 cursor-not-allowed',
                        isDaySelected && 'bg-emerald-600 text-white font-bold shadow-xs hover:bg-emerald-700',
                        !isDaySelected && isDayToday && 'border border-emerald-500 text-emerald-600 font-bold',
                        !isDaySelected && !isDayPast && isCurrentMonth && 'hover:bg-muted text-foreground'
                      )}
                    >
                      {dayNum}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* 2. Khung giờ đón: Đón từ ... Đến ... */}
      <div className="space-y-1.5 pt-1">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Khung giờ đón (24h) <span className="text-destructive">*</span>
          </span>
          <span className="text-[11px] text-muted-foreground font-normal">
            Khung đón lý tưởng: 30 – 60 phút
          </span>
        </label>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Giờ đón bắt đầu */}
          <div className="rounded-lg border p-2 bg-background space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              ĐÓN TỪ
            </div>
            <div className="flex items-center gap-1">
              <Select
                value={currentFromHour}
                onValueChange={(h) => handleFromTimeChange(h, currentFromMin)}
              >
                <SelectTrigger className="h-8 px-2 text-xs font-semibold font-mono">
                  <SelectValue placeholder="Giờ" />
                </SelectTrigger>
                <SelectContent className="max-h-48">
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={h} className="text-xs">
                      {h} giờ
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs font-bold text-muted-foreground">:</span>
              <Select
                value={currentFromMin}
                onValueChange={(m) => handleFromTimeChange(currentFromHour, m)}
              >
                <SelectTrigger className="h-8 px-2 text-xs font-semibold font-mono">
                  <SelectValue placeholder="Phút" />
                </SelectTrigger>
                <SelectContent className="max-h-48">
                  {MINUTES.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">
                      {m} phút
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Giờ đón kết thúc */}
          <div className="rounded-lg border p-2 bg-background space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              ĐẾN
            </div>
            <div className="flex items-center gap-1">
              <Select
                value={currentToHour}
                onValueChange={(h) => handleToTimeChange(h, currentToMin)}
              >
                <SelectTrigger className="h-8 px-2 text-xs font-semibold font-mono">
                  <SelectValue placeholder="Giờ" />
                </SelectTrigger>
                <SelectContent className="max-h-48">
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={h} className="text-xs">
                      {h} giờ
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs font-bold text-muted-foreground">:</span>
              <Select
                value={currentToMin}
                onValueChange={(m) => handleToTimeChange(currentToHour, m)}
              >
                <SelectTrigger className="h-8 px-2 text-xs font-semibold font-mono">
                  <SelectValue placeholder="Phút" />
                </SelectTrigger>
                <SelectContent className="max-h-48">
                  {MINUTES.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">
                      {m} phút
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Nút nhanh chỉnh khung giờ (+30p, +45p, +1h) */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[11px] text-muted-foreground">Khung đón:</span>
          {[
            { label: '+30 phút', mins: 30 },
            { label: '+45 phút', mins: 45 },
            { label: '+1 giờ', mins: 60 },
          ].map(({ label, mins }) => {
            const active = toDate.getTime() - fromDate.getTime() === mins * 60000;
            return (
              <button
                key={mins}
                type="button"
                onClick={() => handleDurationBump(mins)}
                className={cn(
                  'px-2 py-0.5 text-[11px] rounded border transition-colors',
                  active
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-semibold'
                    : 'border-muted-foreground/30 hover:bg-muted text-muted-foreground'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Dòng tổng kết trực quan bằng Tiếng Việt 100% */}
      <div className="rounded-lg bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 p-2.5 text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-200">
          <span>🗓️ Thời gian đón khách:</span>
          <span className="text-emerald-700 dark:text-emerald-300 font-extrabold font-mono">
            {format(fromDate, 'HH:mm')} — {format(toDate, 'HH:mm')}
          </span>
        </div>
        <div className="text-emerald-800/80 dark:text-emerald-300/80 capitalize">
          {format(fromDate, 'EEEE, dd/MM/yyyy', { locale: vi })}
        </div>
      </div>

      {/* Cảnh báo nếu giờ đón đã qua hoặc không hợp lệ */}
      {isPastTime && (
        <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">
          ⚠️ Giờ đón đã qua. Vui lòng chọn thời gian đón trong tương lai.
        </div>
      )}
      {isInvalidWindow && (
        <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">
          ⚠️ Giờ kết thúc phải sau giờ bắt đầu.
        </div>
      )}
    </div>
  );
}
