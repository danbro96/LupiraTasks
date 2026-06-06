import { useParams } from "react-router-dom";

export default function ShareViewPage() {
  const { token } = useParams<{ token: string }>();

  return (
    <section>
      <h2>Shared view</h2>
      <p>Placeholder share view for token: {token}</p>
    </section>
  );
}
