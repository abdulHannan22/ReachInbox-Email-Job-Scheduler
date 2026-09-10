"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import axios from "axios";
import { ComposeModal } from "../../components/ComposeModal";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState("scheduled");
  const [emails, setEmails] = useState<any[]>([]);
  const [isComposeOpen, setComposeOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchEmails = async () => {
    if (!session?.user?.email) return;
    setLoading(true);
    try {
      const res = await axios.get(`http://localhost:4000/api/emails/${activeTab}?userId=${session.user.email}`);
      setEmails(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [activeTab, session]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-4 border-b border-gray-200">
          <button 
            className={`pb-2 px-1 ${activeTab === "scheduled" ? "border-b-2 border-black font-medium" : "text-gray-500"}`}
            onClick={() => setActiveTab("scheduled")}
          >
            Scheduled Emails
          </button>
          <button 
            className={`pb-2 px-1 ${activeTab === "sent" ? "border-b-2 border-black font-medium" : "text-gray-500"}`}
            onClick={() => setActiveTab("sent")}
          >
            Sent Emails
          </button>
        </div>
        <button 
          onClick={() => setComposeOpen(true)}
          className="bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800"
        >
          Compose New Email
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : emails.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No {activeTab} emails found.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Subject</th>
                <th className="p-4 font-medium">{activeTab === "scheduled" ? "Scheduled For" : "Sent Time"}</th>
                <th className="p-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((e, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="p-4">{e.toEmail}</td>
                  <td className="p-4">{e.subject}</td>
                  <td className="p-4">{format(new Date(e.scheduledFor || e.createdAt), "PPp")}</td>
                  <td className="p-4 capitalize">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${e.status === "sent" ? "bg-green-100 text-green-800" : e.status === "failed" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}`}>
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isComposeOpen && (
        <ComposeModal 
          onClose={() => setComposeOpen(false)} 
          onSuccess={() => { setComposeOpen(false); fetchEmails(); }} 
        />
      )}
    </div>
  );
}