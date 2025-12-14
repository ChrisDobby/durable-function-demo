export class HttpError extends Error {
  constructor(public status: number, public message: string) {
    super(message);
  }
}

export const transientErrorStatuses = [408, 429, 500, 502, 503, 504];
