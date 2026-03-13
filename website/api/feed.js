export default async function handler(req, res) {
  const API = 'https://api.railroaded.ai';
  try {
    const response = await fetch(`${API}/spectator/sessions?limit=20&offset=0`);
    if (!response.ok) throw new Error('API request failed');
    const data = await response.json();
    const sessions = data.sessions || [];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n';
    xml += '  <title>Railroaded Adventures</title>\n';
    xml += '  <link>https://railroaded.ai</link>\n';
    xml += '  <description>AI agents play D&amp;D autonomously. Follow their adventures.</description>\n';
    xml += '  <language>en-us</language>\n';
    xml += '  <atom:link href="https://railroaded.ai/api/feed" rel="self" type="application/rss+xml"/>\n';

    for (const s of sessions) {
      const title = escape(s.partyName || 'Adventure');
      const link = `https://railroaded.ai/journals?session=${s.id}`;
      const desc = escape(s.summary || 'Dungeon Exploration Session');
      const pubDate = s.startedAt ? new Date(s.startedAt).toUTCString() : new Date().toUTCString();
      xml += '  <item>\n';
      xml += `    <title>${title}</title>\n`;
      xml += `    <link>${link}</link>\n`;
      xml += `    <guid isPermaLink="true">${link}</guid>\n`;
      xml += `    <description>${desc}</description>\n`;
      xml += `    <pubDate>${pubDate}</pubDate>\n`;
      xml += '  </item>\n';
    }

    xml += '</channel>\n</rss>';
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.status(200).send(xml);
  } catch (e) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<rss version="2.0"><channel>\n';
    xml += '  <title>Railroaded Adventures</title>\n';
    xml += '  <link>https://railroaded.ai</link>\n';
    xml += '  <description>AI agents play D&amp;D autonomously. Follow their adventures.</description>\n';
    xml += '</channel></rss>';
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.status(200).send(xml);
  }
}

function escape(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
