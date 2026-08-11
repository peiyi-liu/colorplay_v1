import {
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  useState,
} from 'react';

const HUD_INTERACTION_SELECTOR =
  '.student-hud-reveal-zone, .hud-top--student, .student-hud-dismiss-zone';

function isHudInteractionTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(HUD_INTERACTION_SELECTOR) !== null
  );
}

export function StudentHudAutoHide({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [expanded, setExpanded] = useState(false);

  const reveal = () => {
    setExpanded(true);
  };

  const handlePointerLeave = (event: PointerEvent<HTMLElement>) => {
    if (isHudInteractionTarget(event.relatedTarget)) return;
    setExpanded(false);
  };

  const handleHudFocus = () => {
    setExpanded(true);
  };

  const handleHudBlur = (event: FocusEvent<HTMLElement>) => {
    if (isHudInteractionTarget(event.relatedTarget)) return;
    setExpanded(false);
  };

  return (
    <>
      <span
        aria-hidden="true"
        className="student-hud-reveal-zone"
        onPointerEnter={reveal}
        onPointerLeave={handlePointerLeave}
      />
      <span
        aria-hidden="true"
        className="student-hud-dismiss-zone"
        data-hud-expanded={expanded ? 'true' : 'false'}
        onPointerEnter={reveal}
        onPointerLeave={handlePointerLeave}
      />
      <header
        className="hud-top hud-top--student"
        data-hud-expanded={expanded ? 'true' : 'false'}
        onBlur={handleHudBlur}
        onFocus={handleHudFocus}
        onPointerEnter={reveal}
        onPointerLeave={handlePointerLeave}
      >
        {children}
      </header>
    </>
  );
}
