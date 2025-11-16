// app/page.tsx
import GameClient from "./GameClient";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      <GameClient />
    </main>
  );
}
