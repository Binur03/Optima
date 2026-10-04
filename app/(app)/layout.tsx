import { XpBar } from "@/components/XpBar";

// Signed-in app shell: the XP / level bar sits above every tab.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <XpBar />
      {children}
    </>
  );
}
