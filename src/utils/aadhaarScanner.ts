import * as ImagePicker from "expo-image-picker";
import TextRecognition from "@react-native-ml-kit/text-recognition";

export type AadhaarScanResult = {
  name?: string | null;
  aadhaar?: string | null;
  phone?: string | null;
  location_desc?: string | null;
};

const AADHAAR_WORDS = new Set([
  "government",
  "india",
  "aadhaar",
  "uidai",
  "unique",
  "identification",
  "authority",
  "dob",
  "year",
  "male",
  "female",
  "address",
]);

export function parseAadhaarScanData(text: string): AadhaarScanResult | null {
  const xmlAadhaar = text.match(/\b\d{12}\b/)?.[0] ?? null;
  const xmlName = text.match(/\bname=["']([^"']+)["']/i)?.[1] ?? text.match(/\bn=["']([^"']+)["']/i)?.[1] ?? null;
  const xmlPhone = text.match(/\b(?:phone|mobile|m)=["']([^"']+)["']/i)?.[1]?.replace(/[^\d+]/g, "") ?? null;
  const xmlAddress = ["co", "house", "street", "loc", "vtc", "dist", "state", "pc"]
    .map((key) => text.match(new RegExp(`\\b${key}=["']([^"']+)["']`, "i"))?.[1])
    .filter(Boolean)
    .join(", ");
  if (xmlAadhaar) {
    return { name: xmlName, aadhaar: xmlAadhaar, phone: xmlPhone, location_desc: xmlAddress || null };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const joined = lines.join(" ");
  const aadhaar = joined.match(/\b(?:\d[ -]?){12}\b/)?.[0]?.replace(/\D/g, "") ?? null;
  if (!aadhaar || aadhaar.length !== 12) return null;

  const phone = joined.match(/\b(?:\+91[- ]?)?[6-9]\d{9}\b/)?.[0]?.replace(/[^\d+]/g, "") ?? null;
  const aadhaarLineIndex = lines.findIndex((line) => line.replace(/\D/g, "").includes(aadhaar.slice(0, 4)));
  const name =
    lines
      .slice(0, aadhaarLineIndex >= 0 ? aadhaarLineIndex : Math.min(lines.length, 8))
      .find((line) => {
        const words = line.toLowerCase().split(/\s+/);
        return (
          /^[A-Za-z][A-Za-z .'-]{2,}$/.test(line) &&
          words.length <= 5 &&
          !words.some((word) => AADHAAR_WORDS.has(word)) &&
          !/\d/.test(line)
        );
      }) ?? null;

  const addressStart = lines.findIndex((line) => /address|s\/o|d\/o|w\/o|c\/o/i.test(line));
  const location_desc =
    addressStart >= 0
      ? lines
          .slice(addressStart, Math.min(lines.length, addressStart + 5))
          .join(", ")
          .replace(/^address[:\s-]*/i, "")
          .trim()
      : null;

  return { name, aadhaar, phone, location_desc };
}

export async function scanAadhaarCard(): Promise<AadhaarScanResult | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  });

  if (result.canceled || !result.assets[0]?.uri) return null;

  try {
    const recognized = await TextRecognition.recognize(result.assets[0].uri);
    return parseAadhaarScanData(recognized.text);
  } catch (error) {
    console.error("Aadhaar scan error:", error);
    return null;
  }
}
