const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface GenerateRequest {
  prompt: string;
}

export interface GenerateResponse {
  id: string;
  status: "pending" | "processing" | "ready" | "error";
}

export interface ModelResponse {
  id: string;
  status: "pending" | "processing" | "ready" | "error";
  prompt: string;
  stlUrl?: string;
  createdAt: string;
}

export async function generateModel(
  data: GenerateRequest,
  token: string
): Promise<GenerateResponse> {
  const res = await fetch(`${API_BASE_URL}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`Generate failed: ${res.status}`);
  }

  return res.json();
}

export async function getModel(
  id: string,
  token: string
): Promise<ModelResponse> {
  const res = await fetch(`${API_BASE_URL}/models/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Get model failed: ${res.status}`);
  }

  return res.json();
}
