import { useEffect, useState } from 'react';

const prefersReducedMotion = () =>
  document.documentElement.dataset.reducedMotion === 'true' ||
  (typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

const canAnimate = () =>
  typeof window.requestAnimationFrame === 'function' && !prefersReducedMotion();

const useCountUp = (target: number, durationMs: number) => {
  const [value, setValue] = useState(() => (canAnimate() ? 0 : target));
  // reduced-motion 下不跑動畫,value 必須緊跟 target——用「渲染期間調整狀態」
  // (React 官方 pattern，非 effect 內 setState)取代，避免 target 變更時
  // 停留在舊值一個 render(M2:計畫原文要點是「不留陳值」，此寫法比 effect
  // 版更早生效且不觸發 react-hooks/set-state-in-effect)。
  const [staticTarget, setStaticTarget] = useState(target);
  if (!canAnimate() && staticTarget !== target) {
    setStaticTarget(target);
    setValue(target);
  }

  useEffect(() => {
    if (!canAnimate()) {
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * ratio));
      if (ratio < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [durationMs, target]);

  return value;
};

/** 寶箱結算:確定性獎勵演出——數值全來自伺服器回傳,禁止隨機(spec §5 result 列)。
    開箱與滾動皆在 600ms 內完成;reduced-motion 直接呈現最終值。 */
export function LootReveal({
  correctCount,
  questionCount,
  tokensAwarded,
  totalScore,
  xpAwarded,
}: Readonly<{
  correctCount: number;
  questionCount: number;
  tokensAwarded: number;
  totalScore: number;
  xpAwarded: number;
}>) {
  const [open, setOpen] = useState(() => !canAnimate());
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => {
      setOpen(true);
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);
  const score = useCountUp(totalScore, 600);
  const xp = useCountUp(xpAwarded, 600);
  const tokens = useCountUp(tokensAwarded, 600);

  return (
    <div className="loot-reveal" data-open={open ? 'true' : 'false'}>
      <div className="loot-chest" aria-hidden="true">
        <span className="loot-chest__lid" />
        <span className="loot-chest__base" />
      </div>
      <div className="quiz-result__totals" aria-label="挑戰結果摘要">
        <p>總分 {String(score)}</p>
        <p>
          答對 {String(correctCount)} / {String(questionCount)} 題
        </p>
        <p>+{String(xp)} XP</p>
        <p>+{String(tokens)} Token</p>
      </div>
    </div>
  );
}
