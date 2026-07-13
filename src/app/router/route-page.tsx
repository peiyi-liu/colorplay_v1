import { Link } from 'react-router-dom';

export function RoutePage({
  actionLabel,
  actionTo,
  eyebrow,
  heading,
  message,
}: Readonly<{
  actionLabel: string;
  actionTo: string;
  eyebrow: string;
  heading: string;
  message: string;
}>) {
  return (
    <section className="route-panel" data-interaction-group="foundation-route">
      <p className="route-panel__eyebrow">{eyebrow}</p>
      <h1>{heading}</h1>
      <p className="route-panel__message">{message}</p>
      <div className="route-panel__action-row">
        <Link
          className="primary-action"
          data-acceptance-interactive="true"
          data-acceptance-target
          data-primary-action="true"
          to={actionTo}
        >
          {actionLabel}
        </Link>
      </div>
    </section>
  );
}
