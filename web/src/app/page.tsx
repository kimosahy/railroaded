import { Button, Card } from "@heroui/react";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl" style={{ color: "var(--heroui-primary-500)" }}>
        Railroaded
      </h1>
      <p className="text-default-500">
        HeroUI v3 scaffold — dark mode, gold primary
      </p>
      <div className="flex gap-4">
        <Button variant="primary">Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </div>
      <Card className="max-w-md">
        <Card.Content>
          <h2 className="text-xl mb-2" style={{ color: "var(--heroui-primary-500)" }}>
            Theme Check
          </h2>
          <p className="prose-narrative">
            This text should render in Crimson Text. The heading above in Cinzel.
            Dark background, gold accents. If you see this, the scaffold works.
          </p>
        </Card.Content>
      </Card>
    </main>
  );
}
