/** Tài xế đang được chọn để mở chi tiết điểm & đánh giá.
 *  `name`/`phone` chỉ để hiện tiêu đề dialog — đã được chuẩn hoá sẵn ở tầng
 *  bảng (driverNameText/driverPhoneText) nên không có null lọt xuống. */
export type SelectedDriver = { id: string; name: string; phone: string };

export type SelectDriver = (driver: SelectedDriver) => void;
