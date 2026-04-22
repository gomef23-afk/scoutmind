const API_KEY = "d312ee23a5msh63a42efb0dd1799p10d94bjsn689b3d982347";
const API_HOST = "api-football-v1.p.rapidapi.com";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  const { endpoint, ...params } = req.query;
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
  const query = new URLSearchParams(params).toString();
  const url = `https://${API_HOST}/v3/${endpoint}${query ? "?" + query : ""}`;
  try {
    const response = await fetch(url, {
      headers: { "X-RapidAPI-Key": API_KEY, "X-RapidAPI-Host": API_HOST }
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "API request failed" });
  }
}
