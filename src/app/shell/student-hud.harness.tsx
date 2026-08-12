// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { BlookArt } from '../../components/ui/blook-art';
import { EconomySummaryView } from '../../features/rewards/components/economy-summary';
import { HudCommandBar } from './hud-command-bar';
import { StudentBackNavigationProvider } from './student-back-navigation';
import { StudentHud } from './student-hud';
import { StudentRouteBackButton } from './student-route-back-button';

export function StudentHudHarness({
  children,
  initialEntry = '/app',
}: Readonly<{ children?: ReactNode; initialEntry?: string }>) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <div className="game-viewport">
        <div className="game-stage" data-shell-role="student">
          <StudentBackNavigationProvider>
            <StudentHud>
              <StudentRouteBackButton />
              <div className="hud-economy-group">
                <div aria-label="學生身分" className="hud-identity" role="group">
                  <span aria-hidden="true" className="hud-avatar">
                    <BlookArt emoji="🦊" size={47} stableCode="little_fox" />
                  </span>
                  <strong className="hud-identity__name">彩虹森林冒險家</strong>
                  <EconomySummaryView
                    summary={{
                      currentLevelXp: 240,
                      level: 12,
                      tokenBalance: 1250,
                      totalXp: 6740,
                      walletReconciled: true,
                      xpPerLevel: 500,
                    }}
                    variant="hud"
                  />
                </div>
              </div>
              <HudCommandBar
                displayName="彩虹森林冒險家"
                isSigningOut={false}
                onSignOut={() => undefined}
                variant="student"
              />
            </StudentHud>
            <main
              className="game-stage__scene route-world-stage student-hud-harness__scene"
              id="main-content"
            >
              {children ?? (
                <span
                  aria-hidden="true"
                  className="student-hud-harness__landscape"
                />
              )}
            </main>
          </StudentBackNavigationProvider>
        </div>
      </div>
    </MemoryRouter>
  );
}
