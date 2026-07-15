import { OllamaResponseError } from "../errors/OllamaResponseError.js";

export async function parseJsonResponse(
  response: Response,
  endpoint: string,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new OllamaResponseError(endpoint, ["body: must contain valid JSON"], {
      cause: error,
    });
  }
}
