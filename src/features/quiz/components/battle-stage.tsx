import {
  SpiritAvatar,
  spiritForSeed,
} from '../../../components/ui/spirit-avatar';

import './battle-stage.css';

export type BattlePhase = 'idle' | 'attacking' | 'hit' | 'miss' | 'enemyStrike';

const phaseClass: Record<BattlePhase, string> = {
  attacking: 'battle-stage--attacking',
  enemyStrike: 'battle-stage--enemy-strike',
  hit: 'battle-stage--hit',
  idle: 'battle-stage--idle',
  miss: 'battle-stage--miss',
};

/** 戰鬥舞台:純裝飾演出。三拍時序由 phase 驅動,verdict 只能來自伺服器回應後的
    feedbackResult——此元件不含任何判定邏輯(spec §4.4)。題目 stable code 只用來
    確定性輪替既有三色精靈，不參與出題、正誤或獎勵判定。 */
export function BattleStage({
  comboCount,
  phase,
  questionSeed,
}: Readonly<{
  comboCount: number;
  phase: BattlePhase;
  questionSeed: string;
}>) {
  const health = phase === 'hit' ? 'empty' : 'full';

  return (
    <div
      aria-hidden="true"
      className={`battle-stage ${phaseClass[phase]}`}
      data-enemy-health={health}
    >
      <div className="battle-stage__enemy">
        <div className="battle-stage__health">
          <span className="battle-stage__health-track">
            <span className="battle-stage__health-fill" />
          </span>
        </div>
        <div className="battle-stage__spirit">
          <SpiritAvatar variant={spiritForSeed(questionSeed)} />
        </div>
        <span className="battle-stage__enemy-name">森林小精靈</span>
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
