export function RoutePage({
  heading,
  message,
}: Readonly<{ heading: string; message: string }>) {
  return (
    <main data-interaction-group="foundation-route">
      <h1>{heading}</h1>
      <p>{message}</p>
    </main>
  );
}
