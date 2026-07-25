import { ExplanationResponse } from "../types";

export const apiCall = async (endpoint: string, payload: any) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Server responded with status ${response.status}`);
  }
  return response.json();
};
