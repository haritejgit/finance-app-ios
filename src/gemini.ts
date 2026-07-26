const GEMINI_MODEL_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

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

Reply with a detailed, comprehensive, and practical answer. Be specific to micro-lending in India. No generic advice.
`;

export const askGemini = async (query: string, stats: BusinessStats): Promise<string> => {
  try {
    if (!process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY === "your_key_here") {
      return "AI is unavailable. Add EXPO_PUBLIC_GEMINI_API_KEY to your local .env file.";
    }

    const res = await fetch(`${GEMINI_MODEL_URL}?key=${process.env.EXPO_PUBLIC_GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(query, stats) }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Gemini API error:", res.status, JSON.stringify(data));
      return `AI error (${res.status}): ${data?.error?.message ?? "Unknown error. Check API key and quota."}`;
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Unable to get AI response.";
  } catch (err) {
    console.error("Gemini fetch error:", err);
    return "AI is unavailable. Check your connection or API key.";
  }
};

export interface ForecastStats extends BusinessStats {
  onTimePaymentRate: number;
  overdueRate: number;
  avgLoanAmount: number;
  weeklyCollections: number[];
}

const buildForecastPrompt = (stats: ForecastStats): string => `
You are an AI financial analyst for a micro-loan business in rural India.

Business data (last 6 months):
* Active customers: ${stats.totalCustomers}
* Active loans: ${stats.activeLoans}
* Overdue customers: ${stats.overdueCount} (${Math.round(stats.overdueRate)}% overdue rate)
* On-time payment rate: ${Math.round(stats.onTimePaymentRate)}%
* Average loan amount: Rs.${Math.round(stats.avgLoanAmount).toLocaleString("en-IN")}
* Total ever distributed: Rs.${stats.totalDistributed.toLocaleString("en-IN")}
* Total ever collected: Rs.${stats.totalCollected.toLocaleString("en-IN")}
* Last 6 weeks collections: ${stats.weeklyCollections.map((w, i) => `Week ${i + 1}: Rs.${Math.round(w).toLocaleString("en-IN")}`).join(", ")}
* This month collected: Rs.${stats.monthCollection.toLocaleString("en-IN")}

Provide a STRUCTURED forecast in exactly this format (keep each section to 2 lines max):

📊 **DEFAULT RISK**
[Your prediction about % of customers likely to default next month and why]

📅 **BEST LENDING MONTHS**
[Which months are best for disbursing new loans based on the data]

💰 **4-WEEK CASH FLOW**
[Expected collection trend for the next 4 weeks with approximate amounts]

⚠️ **KEY RISK WARNING**
[The single biggest risk to watch out for right now]

Keep the total response under 180 words. Be specific with numbers.
`;

export const askGeminiForecast = async (stats: ForecastStats): Promise<string> => {
  try {
    if (!process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY === "your_key_here") {
      return "AI Forecast is unavailable. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file.";
    }
    const res = await fetch(`${GEMINI_MODEL_URL}?key=${process.env.EXPO_PUBLIC_GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildForecastPrompt(stats) }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 512 },
      }),
    });
    const data = await res.json();
    if (!res.ok) return `AI error (${res.status}): ${data?.error?.message ?? "Unknown error."}`;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Unable to generate forecast.";
  } catch (err) {
    return "AI Forecast unavailable. Check your connection or API key.";
  }
};

