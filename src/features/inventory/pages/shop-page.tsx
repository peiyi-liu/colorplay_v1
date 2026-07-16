import { useEffect, useRef, useState } from 'react';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import {
  useBlookInventory,
  useEquipBlook,
  usePurchaseBlook,
} from '../hooks/use-blook-inventory';
import {
  type BlookInventoryItem,
  type InventoryRepository,
  InventoryRepositoryError,
} from '../types';

const mutationErrorMessage = (error: unknown): string => {
  if (
    error instanceof InventoryRepositoryError &&
    error.code === 'INSUFFICIENT_TOKENS' &&
    error.shortfall !== null
  ) {
    return `Token 不足，還差 ${String(error.shortfall)} Token。`;
  }
  if (
    error instanceof InventoryRepositoryError &&
    error.code === 'AUTH_REQUIRED'
  ) {
    return '登入狀態已失效，請重新登入。';
  }
  return 'Blook 操作失敗，請稍後重試。';
};

export function ShopPage({
  repository,
}: Readonly<{ repository?: InventoryRepository }>) {
  const inventory = useBlookInventory(repository);
  const purchase = usePurchaseBlook(repository);
  const equip = useEquipBlook(repository);
  const [selectedPurchase, setSelectedPurchase] =
    useState<BlookInventoryItem>();
  const [announcement, setAnnouncement] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const purchaseTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!selectedPurchase) return;
    const dialog = dialogRef.current;
    const purchaseTrigger = purchaseTriggerRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    cancelButtonRef.current?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      purchaseTrigger?.focus();
    };
  }, [selectedPurchase]);

  useEffect(() => {
    if (!selectedPurchase || purchase.isPending) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedPurchase(undefined);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [purchase.isPending, selectedPurchase]);

  if (inventory.isPending) return <RouteLoading withinMain />;
  if (inventory.isError) {
    return (
      <section className="shop-message-panel">
        <h1>Blook 商店</h1>
        <p role="alert">無法載入 Blook 商店，請稍後重試。</p>
        <button
          className="primary-action"
          onClick={() => void inventory.refetch()}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const runEquip = async (item: BlookInventoryItem) => {
    setActionError(undefined);
    setAnnouncement(undefined);
    try {
      await equip.mutateAsync(item.id);
      setAnnouncement(`已裝備${item.name}。`);
    } catch (error) {
      setActionError(mutationErrorMessage(error));
    }
  };

  const confirmPurchase = async () => {
    if (!selectedPurchase) return;
    const item = selectedPurchase;
    setActionError(undefined);
    setAnnouncement(undefined);
    try {
      await purchase.mutateAsync(item.id);
      setSelectedPurchase(undefined);
      setAnnouncement(`已購買${item.name}。`);
    } catch (error) {
      setSelectedPurchase(undefined);
      setActionError(mutationErrorMessage(error));
    }
  };

  return (
    <section className="blook-shop" aria-labelledby="blook-shop-title">
      <header className="blook-shop__header">
        <div>
          <p className="route-panel__eyebrow">你的角色收藏</p>
          <h1 id="blook-shop-title">Blook 商店</h1>
          <p>購買與裝備都會由伺服器確認，重新整理後仍會保留。</p>
        </div>
        <strong>{String(inventory.data.tokenBalance)} Token 可用</strong>
      </header>

      {announcement ? <p role="status">{announcement}</p> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}

      <div className="blook-grid">
        {inventory.data.items.map((item) => {
          const shortfall = item.costTokens - inventory.data.tokenBalance;
          return (
            <article className="blook-card" key={item.id}>
              <span className="blook-card__emoji" aria-hidden="true">
                {item.emoji}
              </span>
              <h2>{item.name}</h2>
              <p>{String(item.costTokens)} Token</p>
              {item.equipped ? (
                <strong className="blook-card__state">已裝備</strong>
              ) : item.owned ? (
                <button
                  aria-label={`選用 ${item.name}`}
                  className="secondary-action"
                  disabled={equip.isPending || purchase.isPending}
                  onClick={() => void runEquip(item)}
                  type="button"
                >
                  選用
                </button>
              ) : shortfall <= 0 ? (
                <button
                  aria-label={`購買 ${item.name}，${String(item.costTokens)} Token`}
                  className="primary-action"
                  disabled={equip.isPending || purchase.isPending}
                  onClick={(event) => {
                    setActionError(undefined);
                    setAnnouncement(undefined);
                    purchaseTriggerRef.current = event.currentTarget;
                    setSelectedPurchase(item);
                  }}
                  type="button"
                >
                  購買 {String(item.costTokens)} Token
                </button>
              ) : (
                <button
                  aria-label={`還差 ${String(shortfall)} Token，無法購買 ${item.name}`}
                  className="blook-card__disabled"
                  disabled
                  type="button"
                >
                  還差 {String(shortfall)} Token
                </button>
              )}
            </article>
          );
        })}
      </div>

      {selectedPurchase ? (
        <dialog
          aria-labelledby="purchase-dialog-title"
          aria-modal="true"
          className="purchase-dialog"
          onCancel={(event) => {
            event.preventDefault();
            if (!purchase.isPending) setSelectedPurchase(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !purchase.isPending) {
              event.preventDefault();
              setSelectedPurchase(undefined);
            }
          }}
          ref={dialogRef}
        >
          <h2 id="purchase-dialog-title">購買「{selectedPurchase.name}」？</h2>
          <p>將扣除 {String(selectedPurchase.costTokens)} Token。</p>
          <div className="purchase-dialog__actions">
            <button
              className="secondary-action"
              disabled={purchase.isPending}
              onClick={() => {
                setSelectedPurchase(undefined);
              }}
              ref={cancelButtonRef}
              type="button"
            >
              取消
            </button>
            <button
              className="primary-action"
              disabled={purchase.isPending}
              onClick={() => void confirmPurchase()}
              type="button"
            >
              {purchase.isPending ? '購買中…' : '確認購買'}
            </button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
