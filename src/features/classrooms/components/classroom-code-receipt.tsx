import type { ClassroomCodeReceipt } from '../types';

export function ClassroomCodeReceiptView({
  onDismiss,
  receipt,
}: Readonly<{
  onDismiss(): void;
  receipt: ClassroomCodeReceipt;
}>) {
  return (
    <aside aria-label="一次性班級加入碼" className="route-panel" role="status">
      <h2>{receipt.classroomName ?? '班級'}的新加入碼</h2>
      <p>
        <strong>{receipt.joinCode}</strong>
      </p>
      <p>
        版本 {String(receipt.joinCodeVersion)}
        。加入碼只顯示這一次，請立即安全保存。
      </p>
      <button className="secondary-action" onClick={onDismiss} type="button">
        我已保存，關閉
      </button>
    </aside>
  );
}
