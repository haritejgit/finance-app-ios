import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

const generateGemini = httpsCallable<{ prompt: string; temperature?: number; maxOutputTokens?: number }, { text: string }>(
  getFunctions(getApp(), "us-central1"),
  "generateGemini"
);

async function requestGemini(prompt: string, temperature: number, maxOutputTokens: number): Promise<string> {
  try {
    const result = await generateGemini({ prompt, temperature, maxOutputTokens });
    return result.data.text || "Unable to get an AI response.";
  } catch (error: any) {
    if (error?.code === "functions/failed-precondition") {
      return "AI is not configured yet. Ask the account owner to configure the Gemini server API key.";
    }
    if (error?.code === "functions/unauthenticated") return "Sign in to use the finance assistant.";
    if (error?.code === "functions/resource-exhausted") return "AI request limit reached. Try again shortly.";
    return "AI is unavailable right now. Check your connection and try again.";
  }
}

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
  return requestGemini(buildPrompt(query, stats), 0.7, 2048);
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
  return requestGemini(buildForecastPrompt(stats), 0.5, 512);
};

