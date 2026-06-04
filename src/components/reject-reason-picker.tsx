'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MultiSelectComboBox } from '@/components/ui/multi-select-combobox';
import { REJECT_REASONS } from '@/lib/reject-reasons';

type RejectReasonPickerProps = {
  selectedValues: string[];
  onSelectedValuesChange: (values: string[]) => void;
  note: string;
  onNoteChange: (note: string) => void;
  disabled?: boolean;
};

export function RejectReasonPicker({
  selectedValues,
  onSelectedValuesChange,
  note,
  onNoteChange,
  disabled = false,
}: RejectReasonPickerProps) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label>Lý do từ chối</Label>
        <MultiSelectComboBox
          options={REJECT_REASONS}
          selectedValues={selectedValues}
          onSelectedValuesChange={onSelectedValuesChange}
          placeholder="Chọn một hoặc nhiều lý do..."
          searchPlaceholder="Tìm lý do..."
          noResultsText="Không có lý do phù hợp."
          disabled={disabled}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="reject-note">Ghi chú thêm (không bắt buộc)</Label>
        <Textarea
          id="reject-note"
          placeholder="VD: Ảnh bằng lái chụp thiếu góc dưới, vui lòng chụp lại rõ nét."
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
