import { useEffect, useRef, useState } from 'react';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useToast } from '../../../components/ui/toast';
import {
  useBlookInventory,
  useEquipBlook,
  useEquipFrame,
  useFrameInventory,
  usePurchaseBlook,
  usePurchaseFrame,
} from '../hooks/use-blook-inventory';
import {
  type BlookInventoryItem,
  type FrameInventoryItem,
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

function FrameShopSection({
  repository,
}: Readonly<{ repository?: InventoryRepository }>) {
  const toast = useToast();
  const frames = useFrameInventory(repository);
  const purchase = usePurchaseFrame(repository);
  const equip = useEquipFrame(repository);
  if (frames.isPending || frames.isError) return null;

  const run = async (item: FrameInventoryItem) => {
    try {
      if (!item.owned) {
        // 購買即裝備（owner 2026-07-21 #12）：買到的邊框立即反映在大廳頭貼。
        await purchase.mutateAsync(item.id);
        await equip.mutateAsync(item.id);
        toast({ message: `已購買並裝備${item.name}。`, tone: 'success' });
        return;
      }
      await equip.mutateAsync(item.id);
      toast({ message: `已裝備${item.name}。`, tone: 'success' });
    } catch (mutationError) {
      toast({ message: mutationErrorMessage(mutationError), tone: 'error' });
    }
  };

  return (
    <section aria-labelledby="frame-shop-title" className="frame-shop">
      <h2 id="frame-shop-title">尊絕外顯邊框</h2>
      <p className="frame-shop__hint">裝備後將顯示在大廳頭貼外框。</p>
      <div className="frame-shop__grid">
        {frames.data.items.map((item) => (
          <article className="frame-card" key={item.id}>
            <span
              aria-hidden="true"
              className="frame-card__swatch"
              style={{
                background: `linear-gradient(to right, ${item.gradientStart}, ${item.gradientEnd})`,
              }}
            />
            <h3>{item.name}</h3>
            <p>
              {item.costTokens === 0
                ? '預設擁有'
                : `${String(item.costTokens)} Token`}
            </p>
            {item.equipped ? (
              <strong className="frame-card__state">已裝備</strong>
            ) : (
              <button
                className="secondary-action"
                disabled={purchase.isPending || equip.isPending}
                onClick={() => void run(item)}
                type="button"
              >
                {item.owned
                  ? `裝備 ${item.name}`
                  : `購買 ${item.name}（${String(item.costTokens)} Token）`}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function ShopPage({
  repository,
}: Readonly<{ repository?: InventoryRepository }>) {
  const toast = useToast();
  const inventory = useBlookInventory(repository);
  const purchase = usePurchaseBlook(repository);
  const equip = useEquipBlook(repository);
  const [selectedPurchase, setSelectedPurchase] =
    useState<BlookInventoryItem>();
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
    try {
      await equip.mutateAsync(item.id);
      toast({ message: `已裝備${item.name}。`, tone: 'success' });
    } catch (error) {
      toast({ message: mutationErrorMessage(error), tone: 'error' });
    }
  };

  const confirmPurchase = async () => {
    if (!selectedPurchase) return;
    const item = selectedPurchase;
    try {
      await purchase.mutateAsync(item.id);
      setSelectedPurchase(undefined);
      toast({ message: `已購買${item.name}。`, tone: 'success' });
    } catch (error) {
      setSelectedPurchase(undefined);
      toast({ message: mutationErrorMessage(error), tone: 'error' });
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

      <FrameShopSection {...(repository ? { repository } : {})} />

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
