import { request } from 'node:http';

/** Error answered by the Docker Engine API. */
export class DockerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Tiny client of the Docker Engine API over its Unix socket (no dependency).
 * Only the calls the updater needs. https://docs.docker.com/reference/api/engine/
 */
export class DockerClient {
  constructor(private readonly socketPath = '/var/run/docker.sock') {}

  private call(method: string, path: string, body?: unknown): Promise<string> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = request(
        {
          socketPath: this.socketPath,
          method,
          path,
          headers: payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {},
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode ?? 0;
            if (status >= 400) {
              let message = text;
              try {
                message = (JSON.parse(text) as { message?: string }).message ?? text;
              } catch {
                // plain-text error
              }
              reject(new DockerError(status, `Docker ${method} ${path}: ${status} ${message}`));
            } else resolve(text);
          });
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const text = await this.call(method, path, body);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async send(method: string, path: string, body?: unknown): Promise<void> {
    await this.call(method, path, body);
  }

  /** Pulls an image. The API streams JSON lines and reports failures inside the stream. */
  async pull(repository: string, tag: string): Promise<void> {
    const q = new URLSearchParams({ fromImage: repository, tag });
    const text = await this.call('POST', `/images/create?${q}`);
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as { error?: string; errorDetail?: { message?: string } };
      if (event.error) throw new Error(event.errorDetail?.message ?? event.error);
    }
  }
}
