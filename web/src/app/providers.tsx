"use client";

import { RouterProvider, Toast } from "@heroui/react";
import { useRouter } from "next/navigation";
import { CharacterDrawerProvider } from "@/components/character-drawer-provider";
import { CharacterDrawer } from "@/components/character-drawer";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <RouterProvider navigate={router.push}>
      <CharacterDrawerProvider>
        {children}
        <CharacterDrawer />
      </CharacterDrawerProvider>
      <Toast.Provider placement="bottom" />
    </RouterProvider>
  );
}
