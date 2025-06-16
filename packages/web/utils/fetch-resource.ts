export async function fetchResource<T>(
  url: string,
  transform: (r: Response) => Promise<T>,
): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error("[ Failed to fetch resource ]", {
        url,
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }
    return await transform(response);
  } catch (error) {
    console.error("Failed to fetch or parse manifest", { error, url });
    return null;
  }
}
