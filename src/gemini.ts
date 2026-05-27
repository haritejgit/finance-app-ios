const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.EXPO_PUBLIC_GEMINI_API_KEY}`;

export interface BusinessStats {
  totalCustomers: number;
  activeLoans: number;
  todayCollection: number;
  monthCollection: number;
  overdueCount: number;
  monthDistributed: number;
  totalDistributed: number;
  totalCollected: number;
}

const buildPrompt = (userQuery: string, stats: BusinessStats): string => `
You are a financial advisor for a micro-loan business in rural India.
Business context:
* Active customers: ${stats.totalCustomers}
* Active loans: ${stats.activeLoans}
* Collected today: Rs.${stats.todayCollection.toLocaleString("en-IN")}
* Collected this month: Rs.${stats.monthCollection.toLocaleString("en-IN")}
* Distributed this month: Rs.${stats.monthDistributed.toLocaleString("en-IN")}
* Overdue customers: ${stats.overdueCount}
* Total ever distributed: Rs.${stats.totalDistributed.toLocaleString("en-IN")}
* Total ever collected: Rs.${stats.totalCollected.toLocaleString("en-IN")}

User question: "${userQuery}"

Reply in 2-3 short, practical sentences. Be specific to micro-lending in India. No generic advice.
`;

export const askGemini = async (query: string, stats: BusinessStats): Promise<string> => {
  try {
    if (!process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY === "your_key_here") {
      return "AI is unavailable. Add EXPO_PUBLIC_GEMINI_API_KEY to your local .env file.";
    }

    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(query, stats) }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
      }),
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Unable to get AI response.";
  } catch {
    return "AI is unavailable. Check your connection or API key.";
  }
};
