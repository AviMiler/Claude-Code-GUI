/** Server-sent events hub: every open browser tab receives every event. */
const clients = new Set();

function addClient(response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  response.write(': connected\n\n');
  clients.add(response);
  response.on('close', () => clients.delete(response));
}

/** @param {object} event Serialized as JSON and sent to all tabs. */
function broadcast(event) {
  const message = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) client.write(message);
}

module.exports = { addClient, broadcast };
