export type BattlePhase = 'idle' | 'attacking' | 'hit' | 'miss' | 'enemyStrike';

const phaseClass: Record<BattlePhase, string> = {
  attacking: 'battle-stage--attacking',
  enemyStrike: 'battle-stage--enemy-strike',
  hit: 'battle-stage--hit',
  idle: 'battle-stage--idle',
  miss: 'battle-stage--miss',
};

/** 戰鬥舞台:純裝飾演出。三拍時序由 phase 驅動,verdict 只能來自伺服器回應後的
    feedbackResult——此元件不含任何判定邏輯(spec §4.4)。幾何魔物為 CSS-first
    佔位,素材批換裝(spec §4.5)。 */
export function BattleStage({
  comboCount,
  phase,
}: Readonly<{ comboCount: number; phase: BattlePhase }>) {
  return (
    <div aria-hidden="true" className={`battle-stage ${phaseClass[phase]}`}>
      <div className="battle-stage__monster">
        <span className="battle-monster__body" />
        <span className="battle-monster__eye battle-monster__eye--left" />
        <span className="battle-monster__eye battle-monster__eye--right" />
      </div>
      {phase === 'attacking' ? <span className="battle-stage__slash" /> : null}
      {phase === 'miss' ? (
        <span className="battle-stage__label battle-stage__label--latin">
          MISS
        </span>
      ) : null}
      {phase === 'enemyStrike' ? (
        <span className="battle-stage__label battle-stage__label--strike">
          魔物反擊！
        </span>
      ) : null}
      {comboCount >= 2 ? (
        <span className="battle-stage__combo">COMBO ×{comboCount}</span>
      ) : null}
    </div>
  );
}
