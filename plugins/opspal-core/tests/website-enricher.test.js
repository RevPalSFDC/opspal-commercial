const http = require('http');

const {
  WebsiteEnricher
} = require('../scripts/lib/enrichment/website-enricher');

describe('WebsiteEnricher', () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/final' });
        res.end();
        return;
      }

      if (req.url === '/final') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>redirected</body></html>');
        return;
      }

      res.writeHead(404);
      res.end('not found');
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('follows redirects in _httpGet', async () => {
    const enricher = new WebsiteEnricher();
    const body = await enricher._httpGet(`${baseUrl}/redirect`);

    expect(body).toContain('redirected');
  });

  test('_fetchPage uses _httpGet when no fetchFn is configured', async () => {
    const enricher = new WebsiteEnricher();
    const httpGetSpy = jest.spyOn(enricher, '_httpGet').mockResolvedValue('<html>fallback</html>');

    const result = await enricher._fetchPage('https://example.com');

    expect(httpGetSpy).toHaveBeenCalledWith('https://example.com');
    expect(result).toBe('<html>fallback</html>');
  });
});
