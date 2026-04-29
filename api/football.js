export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { endpoint, ...params } = req.query;
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });

  const query = new URLSearchParams(params).toString();
  const url = `https://api-football-v1.p.rapidapi.com/v3/${endpoint}${query ? "?" + query : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-key": "d312ee23a5msh63a42efb0dd1799p10d94bjsn689b3d982347",
      "x-rapidapi-host": "api-football-v1.p.rapidapi.com"
    }
  });

  const data = await response.json();
  return res.status(200).json(data);
}
