import * as ImagePicker from "expo-image-picker";

export type AadhaarScanResult = {
  name?: string | null;
  aadhaar?: string | null;
  location_desc?: string | null;
};

function cleanJson(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

export async function scanAadhaarCard(): Promise<AadhaarScanResult | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    alert("Camera permission is required to scan Aadhaar card.");
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    base64: true,
  });

  if (result.canceled || !result.assets[0]?.base64) return null;

  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    console.warn("EXPO_PUBLIC_ANTHROPIC_API_KEY is missing.");
    return null;
  }

  try {
    const asset = result.assets[0];
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: asset.mimeType || "image/jpeg",
                  data: asset.base64,
                },
              },
              {
                type: "text",
                text: `This is an Indian Aadhaar card image. Extract ONLY the following fields and return as JSON:
{
  "name": "full name as printed on card",
  "aadhaar": "12-digit aadhaar number, digits only",
  "location_desc": "address shown on the card, village/town/street portion only"
}
Return ONLY the JSON object, no explanation. If a field is not visible, set it to null.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const parsed = JSON.parse(cleanJson(text)) as AadhaarScanResult;
    return {
      name: parsed.name ?? null,
      aadhaar: parsed.aadhaar?.replace(/\D/g, "") ?? null,
      location_desc: parsed.location_desc ?? null,
    };
  } catch (error) {
    console.error("Aadhaar scan error:", error);
    return null;
  }
}
