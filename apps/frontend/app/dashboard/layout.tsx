"use client";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import axios from "axios";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  const handleConnectSlack = async () => {
    const url = prompt("Enter your Slack Webhook URL to receive rate limit notifications:");
    if (url && session?.user?.email) {
      await axios.post("http://localhost:4000/api/slack/connect", {
        userId: session.user.email,
        webhookUrl: url
      });
      alert("Slack connected successfully!");
    }
  };

  if (status === "loading") return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">ReachInbox</h1>
          <button onClick={handleConnectSlack} className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded font-medium ml-4 border border-gray-200 text-gray-700">Connect Slack</button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {session.user?.image && <img src={session.user.image} alt="Avatar" className="w-8 h-8 rounded-full" />}
            <span className="text-sm font-medium">{session.user?.name}</span>
          </div>
          <button onClick={() => signOut()} className="text-sm text-gray-500 hover:text-black">Logout</button>
        </div>
      </header>
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto">
        {children}
      </main>
    </div>
  );
}