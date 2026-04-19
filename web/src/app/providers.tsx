"use client";

import { RouterProvider, Toast } from "@heroui/react";
import { useRouter } from "next/navigation";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <RouterProvider navigate={router.push}>
      {children}
      <Toast.Provider placement="top" />
    </RouterProvider>
  );
}
