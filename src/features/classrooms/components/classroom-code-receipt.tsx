import { useState } from 'react';

import { Icon } from '../../../components/ui/icons';
import type { ClassroomCodeReceipt } from '../types';

// 加入碼「複製」鍵成功後短暫轉「已複製」的顯示時間；純前端提示，不影響
// 加入碼只顯示這一次的安全語意（碼本身仍只在建立/輪替當下這一次渲染）。
const COPY_LABEL_RESET_DELAY_MS = 2000;

export function ClassroomCodeReceiptView({
  onDismiss,
  receipt,
}: Readonly<{
  onDismiss(): void;
  receipt: ClassroomCodeReceipt;
}>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // 純前端輔助功能：部分瀏覽器／非安全環境沒有 Clipboard API，呼叫本身
    // 會同步拋出，用 try/catch 靜默吞掉，不影響加入碼已經顯示在畫面上。
    try {
      navigator.clipboard
        .writeText(receipt.joinCode)
        .then(() => {
          setCopied(true);
          window.setTimeout(() => {
            setCopied(false);
          }, COPY_LABEL_RESET_DELAY_MS);
        })
        .catch(() => undefined);
    } catch {
      // 同上：Clipboard API 不可用時靜默失敗。
    }
  };

  return (
    <aside aria-label="一次性班級加入碼" className="join-code-card" role="status">
      <div className="join-code-card__head">
        <h2 className="join-code-card__title">
          <span aria-hidden="true" className="join-code-card__badge">
            <Icon name="lock" size={14} />
          </span>
          {receipt.classroomName ?? '班級'}・一次性加入碼
        </h2>
        <span className="join-code-card__version">
          版本 {String(receipt.joinCodeVersion)}
        </span>
      </div>
      <div className="join-code-card__body">
        <div className="join-code-card__code-row">
          <strong className="join-code-card__code">{receipt.joinCode}</strong>
          <button
            className="join-code-card__copy"
            onClick={handleCopy}
            type="button"
          >
            <Icon name="copy" size={14} />
            {copied ? '已複製' : '複製'}
          </button>
        </div>
        <p className="join-code-card__hint">
          加入碼只顯示這一次，請立即安全保存。
        </p>
        <button
          className="secondary-action join-code-card__dismiss"
          onClick={onDismiss}
          type="button"
        >
          我已保存，關閉
        </button>
      </div>
    </aside>
  );
}
