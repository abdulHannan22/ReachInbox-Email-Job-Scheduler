"use client";
import { useState } from "react";
import Papa from "papaparse";
import axios from "axios";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";

export function ComposeModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { data: session } = useSession();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [startTime, setStartTime] = useState("");
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [delayMs, setDelayMs] = useState(2000);
  const [emails, setEmails] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          // Flatten array and extract emails. Assume simple list or first col is email
          const parsedEmails = results.data.map((row: any) => row[0]).filter((email: string) => email.includes("@"));
          setEmails(parsedEmails);
        }
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email) return;
    setLoading(true);
    try {
      await axios.post("http://localhost:4000/api/schedule", {
        userId: session.user.email,
        senderEmail: session.user.email,
        emails,
        subject,
        body,
        startTime: startTime || new Date().toISOString(),
        hourlyLimit,
        delayMs
      });
      onSuccess();
    } catch (err) {
      console.error(err);
      alert("Failed to schedule emails.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-semibold">Compose New Email</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <input required type="text" value={subject} onChange={e => setSubject(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="Email Subject" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Body</label>
            <textarea required rows={4} value={body} onChange={e => setBody(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="Email body..."></textarea>
          </div>
          
          <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50">
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" id="csv-upload" />
            <label htmlFor="csv-upload" className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700">
              {fileName ? fileName : "Upload CSV of Leads"}
            </label>
            {emails.length > 0 && <p className="text-xs text-gray-500 mt-2">{emails.length} valid emails detected.</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Time</label>
              <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hourly Limit</label>
              <input required type="number" value={hourlyLimit} onChange={e => setHourlyLimit(parseInt(e.target.value))} className="w-full border border-gray-300 rounded-md p-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Delay Between Emails (ms)</label>
            <input required type="number" value={delayMs} onChange={e => setDelayMs(parseInt(e.target.value))} className="w-full border border-gray-300 rounded-md p-2 text-sm" />
          </div>
          
          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
            <button disabled={loading || emails.length === 0} type="submit" className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 rounded-md disabled:opacity-50">
              {loading ? "Scheduling..." : "Schedule Emails"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}