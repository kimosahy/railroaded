import { SetupClient } from "./setup-client";

export default async function TheaterSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SetupClient sessionId={id} />;
}
