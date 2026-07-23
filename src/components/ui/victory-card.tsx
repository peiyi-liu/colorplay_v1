import { Icon } from './icons';

type VictoryCardProps = Readonly<{
  title: string;
  description?: string;
  xp: number;
  tokens: number;
  badgeName?: string;
  onRetry: () => void;
  onNext?: () => void;
}>;

/** 完賽結算卡：獎勵膠囊＋重練／下一關（GGAME victory card）。 */
export function VictoryCard({
  title,
  description,
  xp,
  tokens,
  badgeName,
  onRetry,
  onNext,
}: VictoryCardProps) {
  return (
    <div className="ui-victory">
      <span className="ui-victory__emoji" aria-hidden="true">
        <Icon name="trophy" size={40} />
      </span>
      <h3 className="ui-victory__title">{title}</h3>
      {description ? (
        <p className="ui-victory__description">{description}</p>
      ) : null}
      {xp > 0 || tokens > 0 || badgeName ? (
        <div className="ui-victory__rewards">
          <span className="ui-victory__reward ui-victory__reward--xp">
            +{xp} XP
          </span>
          <span className="ui-victory__reward ui-victory__reward--token">
            +{tokens} 代幣
          </span>
          {badgeName ? (
            <span className="ui-victory__reward ui-victory__reward--badge">
              <Icon name="medal" size={14} /> 解鎖徽章：{badgeName}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="ui-victory__actions">
        <button type="button" className="ui-victory__retry" onClick={onRetry}>
          重新練習此題（不重複發放經驗）
        </button>
        {onNext ? (
          <button type="button" className="ui-victory__next" onClick={onNext}>
            進入下一關卡 →
          </button>
        ) : null}
      </div>
    </div>
  );
}
